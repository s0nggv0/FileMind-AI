import { z } from "zod";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { getUserId } from "@/lib/server/identity";
import { persistenceConfigured } from "@/lib/server/database";
import { searchService } from "@/lib/server/search";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { SearchRequestSchema } from "@/lib/retrieval/search-contract";
import { SearchFailure } from "@/lib/retrieval/search-failure";

function searchError(error: unknown) {
  return Response.json({ reason: error instanceof SearchFailure ? error.reason : "SEARCH_UNAVAILABLE" }, {
    status: error instanceof SearchFailure ? error.status : apiError(error).status,
  });
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId();
    const url = new URL(request.url);
    if (!userId || !persistenceConfigured()) {
      if (url.searchParams.has("chunkId") || url.searchParams.has("runId")) {
        throw new WorkspaceError("NOT_FOUND", "来源不存在或无法访问。", 404);
      }
      return Response.json({ recent: [] });
    }
    const headers = { "cache-control": "no-store" };
    if (url.searchParams.has("chunkId")) {
      return Response.json(await searchService.getSource(userId, z.uuid().parse(url.searchParams.get("chunkId"))), { headers });
    }
    if (url.searchParams.has("runId")) {
      return Response.json(await searchService.getRun(userId, z.uuid().parse(url.searchParams.get("runId"))), { headers });
    }
    return Response.json({ recent: await searchService.listRecent(userId) }, { headers });
  } catch (error) { return searchError(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = SearchRequestSchema.parse(await readJSON(request, 8192));
    const userId = await getUserId();
    if (!userId || !persistenceConfigured()) {
      throw new WorkspaceError("NOT_FOUND", "请先在工作区导入并保存资料。", 404);
    }
    const prepared = await searchService.prepare(userId, input);
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        const send = (type: string, data: unknown) => {
          if (!closed && !request.signal.aborted) {
            try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`)); }
            catch { closed = true; }
          }
        };
        try {
          const result = await searchService.execute(prepared, request.signal, stage => send("stage", stage));
          send("result", result);
        } catch { send("error", { reason: "SEARCH_UNAVAILABLE" }); }
        finally { if (!closed) { closed = true; controller.close(); } }
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" },
    });
  } catch (error) { return searchError(error); }
}
