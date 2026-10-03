import { z } from "zod";
import { DatabaseTimestampSchema, WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "./schemas";
import { WorkspaceError } from "./authorization";
import type { WorkspaceRepository } from "./repository";

export interface TenantDatabase { query(userId: string, sql: string, values?: unknown[]): Promise<{ rows: unknown[] }> }
export interface TransactionQuery { query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }> }
export interface TransactionalTenantDatabase extends TenantDatabase {
  transaction<T>(userId: string, work: (client: TransactionQuery) => Promise<T>, consistentRead?: boolean): Promise<T>;
}
export const PostgresDateSchema = z.preprocess(value => value instanceof Date ? value.toISOString() : value, DatabaseTimestampSchema);
const WorkspaceRow = z.object({ snapshot: z.record(z.string(), z.unknown()), revision: z.number().int(), updated_at: PostgresDateSchema });
const DocumentRow = z.object({ id: z.uuid(), text_content: z.string(), storage_path: z.string().nullable() });
export function storageFailure(error: unknown): WorkspaceError {
  if (error instanceof WorkspaceError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("revision_conflict")) return new WorkspaceError("CONFLICT", "Workspace changed in another tab. Reload to recover the latest version.", 409);
  if (/not_found|not_owned|row-level security/.test(message)) return new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
  return new WorkspaceError("UNAVAILABLE", "Workspace storage is temporarily unavailable.", 503);
}
export class PostgresWorkspaceRepository implements WorkspaceRepository {
  constructor(private db: TenantDatabase) {}
  async create(userId: string, name: string) {
    z.uuid().parse(userId);
    const snapshot = WorkspaceSnapshotSchema.parse({ id: crypto.randomUUID(), name, revision: 0, documents: [], run: null, proposal: null, texts: {}, updatedAt: new Date().toISOString() });
    await this.db.query(userId, `with profile as (insert into filemind.profiles(id) values($1) on conflict(id) do nothing returning id)
      insert into filemind.workspaces(id,user_id,name,snapshot) values($2,$1,$3,$4)`, [userId, snapshot.id, snapshot.name, snapshot]);
    return snapshot;
  }
  async get(userId: string, id: string) {
    z.uuid().parse(userId); z.uuid().parse(id);
    const result = await this.db.query(userId, `select w.snapshot,w.revision,w.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'text_content',d.text_content,'storage_path',d.storage_path))
      from filemind.documents d where d.user_id=$1 and d.workspace_id=w.id),'[]'::jsonb) as document_rows
      from filemind.workspaces w where w.user_id=$1 and w.id=$2`, [userId, id]);
    if (!result.rows.length) throw new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
    const row = WorkspaceRow.extend({ document_rows: z.array(DocumentRow) }).parse(result.rows[0]);
    const snapshot = WorkspaceSnapshotSchema.parse({ ...row.snapshot, revision: row.revision, updatedAt: row.updated_at, texts: Object.fromEntries(row.document_rows.map(d => [d.id, d.text_content])) });
    snapshot.documents = snapshot.documents.map(d => ({ ...d, storagePath: row.document_rows.find(item => item.id === d.id)?.storage_path ?? d.storagePath }));
    return snapshot;
  }
  async list(userId: string) {
    z.uuid().parse(userId);
    const result = await this.db.query(userId, "select snapshot,revision,updated_at from filemind.workspaces where user_id=$1 order by updated_at desc limit 50", [userId]);
    return z.array(WorkspaceRow).parse(result.rows).map(row => WorkspaceSnapshotSchema.parse({ ...row.snapshot, revision: row.revision, updatedAt: row.updated_at, texts: {} }));
  }
  async save(userId: string, snapshot: WorkspaceSnapshot) {
    z.uuid().parse(userId); const checked = WorkspaceSnapshotSchema.parse(snapshot);
    const result = await this.db.query(userId, "select filemind.save_workspace($1::uuid,$2::jsonb,$3::integer) as revision,now() as updated_at", [userId, checked, checked.revision]);
    const row = z.object({ revision: z.number().int(), updated_at: PostgresDateSchema }).parse(result.rows[0]);
    return { ...checked, revision: row.revision, updatedAt: row.updated_at };
  }
}
