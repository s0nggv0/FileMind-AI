import { z } from "zod";
import { PostgresWorkspaceRepository, type TransactionalTenantDatabase } from "./postgres-repository";
import { WorkspaceError } from "./authorization";
import { buildRelationships } from "./organization-rules";
export const MetadataEditSchema = z.object({
  revision: z.number().int().nonnegative(), category: z.string().trim().min(1).max(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).transform(tags => [...new Map(tags.map(t => [t.normalize("NFKC").toLocaleLowerCase(), t])).values()]),
}).strict();
export class DocumentReader {
  constructor(private db: TransactionalTenantDatabase) {}
  async get(userId: string, id: string) {
    z.uuid().parse(id);
    const result = await this.db.query(userId, `select d.id,d.workspace_id as "workspaceId",d.display_name as name,d.text_content as text,
      d.category,case when d.storage_path is null then 'not_stored' else d.storage_status end as "storageStatus",d.metadata,w.revision,
      coalesce((select array_agg(t.tag order by t.tag) from filemind.document_tags t where t.user_id=$1 and t.document_id=d.id),'{}') as tags
      from filemind.documents d join filemind.workspaces w on w.id=d.workspace_id and w.user_id=d.user_id where d.user_id=$1 and d.id=$2`, [userId, id]);
    if (!result.rows.length) throw new WorkspaceError("NOT_FOUND", "资料不存在或无法访问。", 404);
    return z.object({ id: z.uuid(), workspaceId: z.uuid(), name: z.string(), text: z.string(), category: z.string().nullable(), storageStatus: z.enum(["available", "missing", "not_stored"]), metadata: z.object({ truncated: z.boolean().optional(), warnings: z.array(z.string()).optional() }), revision: z.number().int(), tags: z.array(z.string()) }).parse(result.rows[0]);
  }
  async update(userId: string, id: string, input: z.input<typeof MetadataEditSchema>) {
    const patch = MetadataEditSchema.parse(input);
    const current = await this.get(userId, id);
    await this.db.transaction(userId, async tx => {
      await tx.query("select id from filemind.workspaces where user_id=$1 and id=$2 for update", [userId, current.workspaceId]);
      const repository = new PostgresWorkspaceRepository({ query: (_u, sql, values) => tx.query(sql, values) });
      const snapshot = await repository.get(userId, current.workspaceId);
      if (snapshot.revision !== patch.revision) throw new WorkspaceError("CONFLICT", "这批资料已在其他页面更新。请重新打开详情后再保存。", 409);
      if (snapshot.run?.status !== "completed" || !snapshot.proposal?.documents.some(d => d.id === id)) throw new WorkspaceError("INVALID_STATE", "请先在工作区审阅并应用方案，再修改已保存资料。", 409);
      const plan = snapshot.proposal;
      plan.documents = plan.documents.map(d => d.id === id ? { ...d, category: patch.category, tags: patch.tags } : d);
      const previous = new Map(plan.relationships.map(r => [r.id, r]));
      plan.relationships = buildRelationships(plan.documents).map(r => ({ ...r, decision: previous.get(r.id)?.decision ?? r.decision }));
      snapshot.run.result = structuredClone(plan);
      // The existing atomic save updates the snapshot, document tables, tags and
      // rule relations together. Content/structure remain identical: no embedding
      // or model call, and the index invalidation trigger is not activated.
      await repository.save(userId, snapshot);
    });
    return this.get(userId, id);
  }
}
export type ReadableDocument = Awaited<ReturnType<DocumentReader["get"]>>;
