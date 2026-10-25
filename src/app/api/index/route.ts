import { realAIRequired } from "@/lib/competition";
import { z } from "zod";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { getUserId } from "@/lib/server/identity";
import { database, persistenceConfigured } from "@/lib/server/database";
import { indexKnowledge, refreshIndexVersions } from "@/lib/server/knowledge";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { prepareDocument } from "@/lib/retrieval/prepare-document";
import { IndexStatusRepository, parseIndexQuery } from "@/lib/retrieval/index-status";
import { readiness } from "@/lib/retrieval/readiness";
export async function GET(request: Request) {
  try {
    const { cursor, limit, ...selection } = parseIndexQuery(request.url);
    const userId = await getUserId();
    if (!userId || !persistenceConfigured()) return Response.json({ documents: [], summary: readiness([]), nextCursor: null });
    const scope = { userId, ...selection };
    await refreshIndexVersions(scope);
    return Response.json({ ...await new IndexStatusRepository(database).page(scope, { cursor, limit }), mock: !realAIRequired() }, { headers: { "cache-control": "no-store" } });
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
