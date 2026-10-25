import { z } from "zod";
import type { TenantDatabase } from "../workspace/postgres-repository";
import type { RetrievalScope } from "./types";
import { CHUNK_VERSION } from "./config";
import { readiness, type ReadinessDocument } from "./readiness";

export interface IndexScope { workspaceId?: string; documentIds?: string[] }
export interface IndexStatusPage {
  documents: ReadinessDocument[];
  summary: ReturnType<typeof readiness>;
  nextCursor: string | null;
  mock?: boolean;
}
export function parseIndexQuery(url: string) {
  const params = new URL(url).searchParams;
  const ids = params.has("documentIds") ? params.get("documentIds")!.split(",").filter(Boolean) : params.has("documentId") ? [params.get("documentId")!] : undefined;
  return z.object({ workspaceId: z.uuid().optional(), documentIds: z.array(z.uuid()).max(200).optional(), cursor: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(200) }).parse({
    workspaceId: params.get("workspaceId") ?? undefined, documentIds: ids, cursor: params.get("cursor") ?? undefined, limit: params.get("limit") ?? 200,
  });
}
export function indexStatusURL(scope: IndexScope, cursor?: string) {
  const params = new URLSearchParams();
  if (scope.workspaceId) params.set("workspaceId", scope.workspaceId);
  if (scope.documentIds) params.set("documentIds", [...new Set(scope.documentIds)].sort().join(","));
  if (cursor) params.set("cursor", cursor);
  return `/api/index${params.size ? `?${params}` : ""}`;
}

export class IndexStatusRepository {
  constructor(private db: TenantDatabase) {}
  async page(scope: RetrievalScope, options: { cursor?: string; limit?: number } = {}): Promise<IndexStatusPage> {
    const limit = z.number().int().min(1).max(200).parse(options.limit ?? 200);
    // Scope is applied before paging and aggregation. Counts are grouped by the
    // inputs to the shared state derivation, so totals never describe just a page.
    const result = await this.db.query(scope.userId, `with scoped as (
      select d.id,d.workspace_id as "workspaceId",d.display_name as name,d.file_type as "fileType",d.ocr_status as "ocrStatus",d.vision_status as "visionStatus",
      case when d.storage_path is null then 'not_stored' else d.storage_status end as "storageStatus",
      d.index_status as status,d.index_error_code as "errorCode",d.index_build_status as "buildStatus",d.index_build_error_code as "buildErrorCode",
      (select count(*)::integer from filemind.document_chunks c where c.user_id=$1 and c.document_id=d.id and c.chunk_version=$6 and c.content ~ '[^[:space:]]') as chunks
      from filemind.documents d where d.user_id=$1 and ($2::uuid is null or d.workspace_id=$2) and ($3::uuid[] is null or d.id=any($3::uuid[]))
    ), page as (select * from scoped where ($4::uuid is null or id>$4) order by id limit $5), groups as (
      select status,"buildStatus","fileType","ocrStatus","visionStatus",(chunks>0) as readable,count(*)::integer as count
      from scoped group by status,"buildStatus","fileType","ocrStatus","visionStatus",(chunks>0)
    ) select coalesce((select jsonb_agg(p order by p.id) from page p),'[]') as documents,
      coalesce((select jsonb_agg(g) from groups g),'[]') as groups`, [scope.userId, scope.workspaceId ?? null, scope.documentIds ?? null, options.cursor ?? null, limit + 1, CHUNK_VERSION]);
    const row = result.rows[0] as { documents: ReadinessDocument[]; groups: (Omit<ReadinessDocument,"id"|"name"|"chunks"> & { readable: boolean; count: number })[] };
    const summary = readiness([]);
    for (const group of row.groups) {
      const state = readiness([{ ...group, id: "group", name: "", chunks: group.readable ? 1 : 0 }]);
      for (const key of Object.keys(summary) as (keyof typeof summary)[]) summary[key] += state[key] * group.count;
    }
    const documents = row.documents.slice(0, limit);
    return { documents, summary, nextCursor: row.documents.length > limit ? documents.at(-1)!.id : null };
  }
}
