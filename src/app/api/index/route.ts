import { realAIRequired } from "@/lib/competition";
import { z } from "zod";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { getUserId } from "@/lib/server/identity";
import { database, persistenceConfigured } from "@/lib/server/database";
import { indexKnowledge, refreshIndexVersions } from "@/lib/server/knowledge";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { prepareDocument } from "@/lib/retrieval/prepare-document";
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId || !persistenceConfigured()) return Response.json({ documents: [] });
    await refreshIndexVersions({ userId });
    const result = await database.query(userId, `select d.id,d.workspace_id as "workspaceId",d.file_type as "fileType",d.ocr_status as "ocrStatus",d.vision_status as "visionStatus",case when d.storage_path is null then 'not_stored' else d.storage_status end as "storageStatus",d.display_name as name,d.index_status as status,d.index_error_code as "errorCode",d.index_build_status as "buildStatus",d.index_build_error_code as "buildErrorCode",(select count(*)::integer from filemind.document_chunks c where c.user_id=$1 and c.document_id=d.id) as chunks from filemind.documents d where d.user_id=$1 order by d.created_at desc limit 1500`, [userId]);
    return Response.json({ documents: result.rows, mock: !realAIRequired() }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const userId = await getUserId();
    if (!userId || !persistenceConfigured()) throw new WorkspaceError("NOT_FOUND", "请先导入并保存资料。", 404);
    const body = z.object({ workspaceId: z.uuid().optional(), documentId: z.uuid().optional(), unfinishedOnly: z.boolean().optional() }).strict().refine(value => !value.unfinishedOnly || !!value.documentId).parse(await readJSON(request, 4096));
    const scope = { userId, workspaceId: body.workspaceId };
    const work = () => indexKnowledge(scope, body.documentId);
    return Response.json({ results: body.unfinishedOnly ? await prepareDocument(database, scope, body.documentId!, work) : await work() });
  } catch (error) { return apiError(error); }
}
