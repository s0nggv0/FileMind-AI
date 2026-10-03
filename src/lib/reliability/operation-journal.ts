import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TransactionalTenantDatabase, TransactionQuery } from "../workspace/postgres-repository";
import { WorkspaceError } from "../workspace/authorization";
import { PostgresDateSchema } from "../workspace/postgres-repository";
import { withPathMutex } from "./atomic-file";

export const OperationTypeSchema = z.enum(["document_upload", "workspace_apply", "backup_import", "reindex", "file_delete", "storage_repair", "demo_reset"]);
export type OperationType = z.infer<typeof OperationTypeSchema>;
const OriginalIntentSchema = z.object({ documentId: z.uuid(), workspaceId: z.uuid(), extension: z.enum(["pdf", "docx", "txt", "md", "png", "jpg", "jpeg"]), hash: z.string().regex(/^[a-f0-9]{64}$/), newlyPublished: z.boolean() }).strict();
export const OperationPayloadSchema = z.object({
  workspaceId: z.uuid().optional(), files: z.array(OriginalIntentSchema).max(2000).optional(),
  stagingId: z.uuid().optional(), expectedRevision: z.number().int().nonnegative().optional(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  quarantineIds: z.array(z.uuid()).max(4000).optional(),
  buildId: z.uuid().optional(), documentIds: z.array(z.uuid()).max(4000).optional(),
}).strict();
export type OperationPayload = z.infer<typeof OperationPayloadSchema>;
export const JournalRowSchema = z.object({
  id: z.uuid(), user_id: z.uuid(), operation_type: OperationTypeSchema, resource_id: z.uuid().nullable(),
  lock_key: z.string().min(1).max(160), status: z.enum(["pending", "running", "committed", "rolled_back", "interrupted"]),
  stage: z.string(), payload: OperationPayloadSchema, owner_instance: z.uuid(),
  started_at: PostgresDateSchema, updated_at: PostgresDateSchema, completed_at: PostgresDateSchema.nullable(), error_code: z.string().nullable(),
});
export type JournalRow = z.infer<typeof JournalRowSchema>;
const instance = randomUUID();
export interface OperationContext {
  id: string; userId: string;
  signal: AbortSignal;
  assertActive(): void;
  stage(stage: string, payload?: OperationPayload): Promise<void>;
  commit(tx: TransactionQuery): Promise<void>;
}
export class OperationJournal {
  constructor(public readonly db: TransactionalTenantDatabase) {}
  async get(userId: string, id: string) {
    const result = await this.db.query(userId, "select * from filemind.operation_journal where user_id=$1 and id=$2", [userId, id]);
    return result.rows.length ? JournalRowSchema.parse(result.rows[0]) : null;
  }
  async recent(userId: string) {
    const result = await this.db.query(userId, "select * from filemind.operation_journal where user_id=$1 order by started_at desc limit 30", [userId]);
    return z.array(JournalRowSchema).parse(result.rows);
  }
  async lock<T>(userId: string, key: string, action: (leaseSignal: AbortSignal) => Promise<T>, tryOnly = false): Promise<T | null> {
    const lockKey = `${z.uuid().parse(userId)}:${key}`;
    if (this.db.withOperationLock) return this.db.withOperationLock(lockKey, action, tryOnly);
    // Offline PGlite adapters are single-process; production supplies a physical
    // PostgreSQL session lock, which is released when the process/connection dies.
    return withPathMutex(lockKey, () => action(new AbortController().signal));
  }
  async run<T>(userId: string, type: OperationType, resourceId: string | null, payload: OperationPayload,
    work: (context: OperationContext) => Promise<T>, rollback?: (row: JournalRow) => Promise<void>) {
    z.uuid().parse(userId); OperationTypeSchema.parse(type); if (resourceId) z.uuid().parse(resourceId);
    const checked = OperationPayloadSchema.parse(payload);
    const key = type === "reindex" ? `index:${resourceId}` : "storage";
    return this.lock(userId, key, async leaseSignal => {
      leaseSignal.throwIfAborted();
      const id = randomUUID();
      await this.db.transaction(userId, async tx => {
        await tx.query("insert into filemind.profiles(id) values($1) on conflict do nothing", [userId]);
        await tx.query("insert into filemind.operation_journal(id,user_id,operation_type,resource_id,lock_key,status,stage,payload,owner_instance) values($1,$2,$3,$4,$5,'running','started',$6,$7)", [id, userId, type, resourceId, key, checked, instance]);
      });
      const context: OperationContext = { id, userId, signal: leaseSignal, assertActive: () => leaseSignal.throwIfAborted(),
        stage: async (stage, next) => {
          leaseSignal.throwIfAborted();
          if (!/^[a-z][a-z0-9_]{0,59}$/.test(stage)) throw new Error("Invalid operation stage.");
          const result = await this.db.query(userId, "update filemind.operation_journal set stage=$3,payload=payload||$4::jsonb,updated_at=now() where user_id=$1 and id=$2 and status='running' returning id", [userId, id, stage, OperationPayloadSchema.parse(next ?? {})]);
          if (!result.rows.length) throw new WorkspaceError("CONFLICT", "Operation was interrupted. Retry safely.", 409);
          leaseSignal.throwIfAborted();
        },
        commit: async tx => {
          leaseSignal.throwIfAborted();
          const result = await tx.query("update filemind.operation_journal set status='committed',stage='committed',updated_at=now(),completed_at=now(),error_code=null where user_id=$1 and id=$2 and status='running' returning id", [userId, id]);
          if (!result.rows.length) throw new WorkspaceError("CONFLICT", "Operation cannot commit.", 409);
        },
      };
      try {
        const result = await work(context);
        if ((await this.get(userId, id))?.status !== "committed") throw new Error("OPERATION_NOT_COMMITTED");
        return result;
      } catch (error) {
        const row = await this.get(userId, id).catch(() => null);
        if (row?.status === "running" && leaseSignal.aborted) {
          await this.db.query(userId, "update filemind.operation_journal set status='interrupted',stage='repair_required',updated_at=now(),error_code='LEASE_INTERRUPTED' where user_id=$1 and id=$2 and status='running'", [userId, id]).catch(() => {});
        }
        // An ambiguous COMMIT acknowledgement must never trigger file rollback
        // when the persisted journal proves the business transaction committed.
        if (row && row.status !== "committed" && !leaseSignal.aborted) {
          try {
            await rollback?.(row);
            await this.db.query(userId, "update filemind.operation_journal set status='rolled_back',stage='rolled_back',updated_at=now(),completed_at=now(),error_code='OPERATION_FAILED' where user_id=$1 and id=$2 and status<>'committed'", [userId, id]);
          } catch {
            await this.db.query(userId, "update filemind.operation_journal set status='interrupted',stage='repair_required',updated_at=now(),error_code='REPAIR_REQUIRED' where user_id=$1 and id=$2 and status<>'committed'", [userId, id]).catch(() => {});
          }
        }
        throw error;
      }
    }) as Promise<T>;
  }
}
