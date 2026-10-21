import "server-only";
import { z } from "zod";
import { formatFileSize } from "@/config/upload";
import type { DocumentViewModel } from "@/types";
import { getUserId } from "./identity";
import { database, persistenceConfigured } from "./database";
import { PostgresDateSchema } from "@/lib/workspace/postgres-repository";
import { workspaceRepository } from "./workspace-repository";
export async function getWorkspacePresentation() {
  // Always read request identity: pages must not freeze empty data at build time.
  const persistent = persistenceConfigured(); const user = await getUserId();
  if (!persistent || !user) return { persistent, workspaces: [], documents: [] as DocumentViewModel[], plans: [], totalDocuments: 0, totalWorkspaces: 0 };
  const workspaces = await workspaceRepository.list(user);
  const counts = await database.query(user, `select (select count(*) from filemind.workspaces where user_id=$1) as total_workspaces,
    (select count(*) from filemind.documents where user_id=$1) as total_documents`, [user]);
  const totals = z.object({ total_workspaces: z.coerce.number().int().nonnegative(), total_documents: z.coerce.number().int().nonnegative() }).parse(counts.rows[0]);
  const response = await database.query(user, `select d.id,d.display_name,d.file_type,d.file_size::integer,d.index_status,case when d.storage_path is null then 'not_stored' else d.storage_status end as storage_status,d.summary,d.category,d.created_at,d.updated_at,
    coalesce((select jsonb_agg(jsonb_build_object('tag',t.tag) order by t.tag) from filemind.document_tags t
    where t.user_id=$1 and t.workspace_id=d.workspace_id and t.document_id=d.id),'[]'::jsonb) as document_tags
    from filemind.documents d where d.user_id=$1 order by d.created_at desc limit 1500`, [user]);
  const rows = z.array(z.object({ id: z.uuid(), display_name: z.string(), file_type: z.enum(["pdf", "docx", "txt", "md", "image"]), file_size: z.number(), index_status: z.string(), storage_status:z.enum(["available","missing","not_stored"]), summary: z.string().nullable(), category: z.string().nullable(), created_at: PostgresDateSchema, updated_at: PostgresDateSchema, document_tags: z.array(z.object({ tag: z.string() })) })).parse(response.rows);
  const plans = workspaces.flatMap(w => w.run?.status === "completed" && w.run.result ? [{ ...w.run.result, relationships: w.run.result.relationships.filter(r => r.decision !== "ignored") }] : []);
  const documents: DocumentViewModel[] = rows.map(d => ({ id: d.id, name: d.display_name, type: d.file_type, indexStatus: d.index_status, storageStatus:d.storage_status, size: formatFileSize(d.file_size), summary: d.summary ?? "Document stored. Apply an organization plan to save its summary, category and tags.", category: d.category ?? "Uncategorized", tags: d.document_tags.map(t => t.tag), updatedAt: d.updated_at.slice(0, 10), relations: plans.flatMap(p => p.relationships).filter(r => r.source === d.id || r.target === d.id).length }));
  return { persistent, workspaces, documents, plans, totalDocuments: totals.total_documents, totalWorkspaces: totals.total_workspaces };
}
