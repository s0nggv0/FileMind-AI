import { z } from "zod";
import { DatabaseTimestampSchema, WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "./schemas";
import { WorkspaceError } from "./authorization";
import type { WorkspaceRepository } from "./repository";
import { WORKSPACE_HISTORY_LIMIT } from "./presentation-limits";

export interface TenantDatabase { query(userId: string, sql: string, values?: unknown[]): Promise<{ rows: unknown[] }> }
export interface TransactionQuery { query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }> }
export interface TransactionalTenantDatabase extends TenantDatabase {
  transaction<T>(userId: string, work: (client: TransactionQuery) => Promise<T>, consistentRead?: boolean): Promise<T>;
  withOperationLock?<T>(key: string, work: (leaseSignal: AbortSignal) => Promise<T>, tryOnly?: boolean): Promise<T | null>;
}
export const PostgresDateSchema = z.preprocess(value => value instanceof Date ? value.toISOString() : value, DatabaseTimestampSchema);
const WorkspaceRow = z.object({ snapshot: z.record(z.string(), z.unknown()), revision: z.number().int(), updated_at: PostgresDateSchema });
const DocumentRow = z.object({ id: z.uuid(), text_content: z.string(), storage_path: z.string().nullable(),storage_status:z.enum(["available","missing","not_stored"]) });
const Count = z.coerce.number().int().nonnegative();
const HistoryOverview = z.object({
  totalDocuments: Count, totalWorkspaces: Count, recentReviewWorkspaces: Count,
  workspaces: z.array(z.object({ id: z.uuid(), name: z.string(), documentCount: Count, status: z.string(), updatedAt: PostgresDateSchema })),
  activity: z.array(z.object({ id: z.uuid(), workspaceId: z.uuid(), at: z.number(), message: z.string() })),
});
export type WorkspaceHistoryOverview = z.infer<typeof HistoryOverview>;
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
      coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'text_content',d.text_content,'storage_path',d.storage_path,'storage_status',case when d.storage_path is null then 'not_stored' else d.storage_status end))
      from filemind.documents d where d.user_id=$1 and d.workspace_id=w.id),'[]'::jsonb) as document_rows
      from filemind.workspaces w where w.user_id=$1 and w.id=$2`, [userId, id]);
    if (!result.rows.length) throw new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
    const row = WorkspaceRow.extend({ document_rows: z.array(DocumentRow) }).parse(result.rows[0]);
    const snapshot = WorkspaceSnapshotSchema.parse({ ...row.snapshot, revision: row.revision, updatedAt: row.updated_at, texts: Object.fromEntries(row.document_rows.map(d => [d.id, d.text_content])) });
    snapshot.documents = snapshot.documents.map(d => {const current=row.document_rows.find(item=>item.id===d.id);return {...d,storagePath:current?.storage_path??undefined,storageStatus:current?.storage_status};});
    return snapshot;
  }
  async list(userId: string) {
    z.uuid().parse(userId);
    const result = await this.db.query(userId, "select snapshot,revision,updated_at from filemind.workspaces where user_id=$1 order by updated_at desc limit 50", [userId]);
    return z.array(WorkspaceRow).parse(result.rows).map(row => WorkspaceSnapshotSchema.parse({ ...row.snapshot, revision: row.revision, updatedAt: row.updated_at, texts: {} }));
  }
  async readHistoryOverview(userId: string): Promise<WorkspaceHistoryOverview> {
    z.uuid().parse(userId);
    const result = await this.db.query(userId, `with recent as (
      select id,name,updated_at,coalesce(snapshot->'run'->>'status','draft') as status,
        jsonb_array_length(snapshot->'documents') as document_count,
        coalesce(snapshot->'run'->'activity','[]'::jsonb) as activity
      from filemind.workspaces where user_id=$1 order by updated_at desc,id desc limit $2
    ), events as (
      select r.id as workspace_id,e.value,r.updated_at,e.position from recent r
      cross join lateral jsonb_array_elements(r.activity) with ordinality e(value,position)
      where e.position > jsonb_array_length(r.activity)-3
      order by (e.value->>'at')::numeric desc,r.updated_at desc,r.id desc,e.position asc limit 10
    ) select
      (select count(*) from filemind.documents where user_id=$1) as "totalDocuments",
      (select count(*) from filemind.workspaces where user_id=$1) as "totalWorkspaces",
      (select count(*) from recent where status='waiting_for_review') as "recentReviewWorkspaces",
      coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'updatedAt',updated_at,
        'status',status,'documentCount',document_count) order by updated_at desc,id desc) from recent),'[]'::jsonb) as workspaces,
      coalesce((select jsonb_agg(value || jsonb_build_object('workspaceId',workspace_id)
        order by (value->>'at')::numeric desc,updated_at desc,workspace_id desc,position asc) from events),'[]'::jsonb) as activity`, [userId, WORKSPACE_HISTORY_LIMIT]);
    return HistoryOverview.parse(result.rows[0]);
  }
  async save(userId: string, snapshot: WorkspaceSnapshot) {
    z.uuid().parse(userId); const checked = WorkspaceSnapshotSchema.parse(snapshot);
    const result = await this.db.query(userId, "select filemind.save_workspace($1::uuid,$2::jsonb,$3::integer) as revision,now() as updated_at", [userId, checked, checked.revision]);
    const row = z.object({ revision: z.number().int(), updated_at: PostgresDateSchema }).parse(result.rows[0]);
    return { ...checked, revision: row.revision, updatedAt: row.updated_at };
  }
}
