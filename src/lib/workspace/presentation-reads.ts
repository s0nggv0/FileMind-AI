import { z } from "zod";
import { formatFileSize } from "@/config/upload";
import type { DocumentViewModel } from "@/types";
import { OrganizationProposalSchema } from "./schemas";
import { PostgresDateSchema, PostgresWorkspaceRepository, type TenantDatabase } from "./postgres-repository";
import { APPLIED_PLAN_WORKSPACE_LIMIT, LIBRARY_DOCUMENT_LIMIT, RECENT_DOCUMENT_LIMIT } from "./presentation-limits";

export type RecentDocument = Pick<DocumentViewModel, "id" | "name" | "type" | "category" | "updatedAt" | "relations">;
const Count = z.coerce.number().int().nonnegative();
const RecentRow = z.object({
  id: z.uuid(), display_name: z.string(), file_type: z.enum(["pdf", "docx", "txt", "md", "image"]),
  category: z.string().nullable(), updated_at: PostgresDateSchema, relations: Count,
});
const LibraryRow = RecentRow.extend({
  file_size: z.number(), index_status: z.string(), storage_status: z.enum(["available", "missing", "not_stored"]),
  summary: z.string().nullable(), document_tags: z.array(z.object({ tag: z.string() })),
});

// Preserve the previous business scope: latest workspaces FIRST, then completed
// plans. Do not silently substitute the latest 50 completed plans/all relations.
const PlanScope = `plan_scope as (
  select id,revision,snapshot->'run' as run,updated_at from filemind.workspaces
  where user_id=$1 order by updated_at desc,id desc limit $2
)`;
const Connections = `${PlanScope}, connections as (
  select edge from plan_scope p cross join lateral jsonb_array_elements(p.run->'result'->'relationships') edge
  where p.run->>'status'='completed' and edge->>'decision'<>'ignored'
), connection_counts as (
  select endpoint.document_id,count(*) as relations from connections
  cross join lateral (values (edge->>'source'),(edge->>'target')) endpoint(document_id)
  group by endpoint.document_id
)`;
function recentDocument(d: z.infer<typeof RecentRow>): RecentDocument {
  return { id: d.id, name: d.display_name, type: d.file_type, category: d.category ?? "Uncategorized", updatedAt: d.updated_at.slice(0, 10), relations: d.relations };
}

export async function readWorkspaceOverview(db: TenantDatabase, userId: string) {
  z.uuid().parse(userId);
  const history = await new PostgresWorkspaceRepository(db).readHistoryOverview(userId);
  const response = await db.query(userId, `with ${Connections}
    select d.id,d.display_name,d.file_type,d.category,d.updated_at,coalesce(c.relations,0) as relations
    from filemind.documents d left join connection_counts c on c.document_id=d.id::text
    where d.user_id=$1 order by d.created_at desc,d.id desc limit $3`,
  [userId, APPLIED_PLAN_WORKSPACE_LIMIT, RECENT_DOCUMENT_LIMIT]);
  return { ...history, documents: z.array(RecentRow).parse(response.rows).map(recentDocument) };
}

export async function readLibraryDocuments(db: TenantDatabase, userId: string) {
  z.uuid().parse(userId);
  const response = await db.query(userId, `with ${Connections}, documents as (
    select d.id,d.display_name,d.file_type,d.file_size::integer,d.index_status,
      case when d.storage_path is null then 'not_stored' else d.storage_status end as storage_status,
      d.summary,d.category,d.updated_at,d.created_at,coalesce(c.relations,0) as relations,
      coalesce((select jsonb_agg(jsonb_build_object('tag',t.tag) order by t.tag) from filemind.document_tags t
        where t.user_id=$1 and t.workspace_id=d.workspace_id and t.document_id=d.id),'[]'::jsonb) as document_tags
    from filemind.documents d left join connection_counts c on c.document_id=d.id::text
    where d.user_id=$1 order by d.created_at desc,d.id desc limit $3
  ) select (select count(*) from filemind.documents where user_id=$1) as total,
    coalesce((select jsonb_agg(to_jsonb(d) - 'created_at' order by d.created_at desc,d.id desc)
      from documents d),'[]'::jsonb) as documents`,
  [userId, APPLIED_PLAN_WORKSPACE_LIMIT, LIBRARY_DOCUMENT_LIMIT]);
  const row = z.object({ total: Count, documents: z.array(LibraryRow) }).parse(response.rows[0]);
  const documents: DocumentViewModel[] = row.documents.map(d => ({
    ...recentDocument(d), size: formatFileSize(d.file_size), indexStatus: d.index_status, storageStatus: d.storage_status,
    summary: d.summary ?? "Document stored. Apply an organization plan to save its summary, category and tags.",
    tags: d.document_tags.map(t => t.tag),
  }));
  return { documents, totalDocuments: row.total };
}

export async function readAppliedPlans(db: TenantDatabase, userId: string) {
  z.uuid().parse(userId);
  const response = await db.query(userId, `with ${PlanScope}
    select (select count(*) from filemind.workspaces where user_id=$1) as "totalWorkspaces",
      coalesce((select jsonb_agg(jsonb_build_object('workspaceId',id,'revision',revision,'plan',run->'result')
        order by updated_at desc,id desc) from plan_scope
        where run->>'status'='completed' and run->'result' is not null and run->'result'<>'null'::jsonb),'[]'::jsonb) as plans`,
  [userId, APPLIED_PLAN_WORKSPACE_LIMIT]);
  const row = z.object({ totalWorkspaces: Count, plans: z.array(z.object({ workspaceId: z.uuid(), revision: Count, plan: OrganizationProposalSchema })) }).parse(response.rows[0]);
  return { totalWorkspaces: row.totalWorkspaces, plans: row.plans.map(p => ({
    ...p.plan, workspaceId: p.workspaceId, revision: p.revision, relationships: p.plan.relationships.filter(r => r.decision !== "ignored"),
  })) };
}
