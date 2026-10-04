import { realAIRequired } from "@/lib/competition";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai/get-provider";
import { LLMAgentRunner } from "@/lib/ai/agent-runner";
import { getUserId } from "@/lib/server/identity";
import { getAnalysisCache } from "@/lib/server/analysis-cache";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { workspaceRepository } from "@/lib/server/workspace-repository";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { analyzeWorkspaceImage } from "@/lib/server/multimodal";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    sameOrigin(request); const input = z.object({ workspaceId: z.uuid(), runId: z.uuid(), revision: z.number().int().nonnegative() }).parse(await readJSON(request, 1024));
    if (!realAIRequired()) throw new WorkspaceError("INVALID_STATE", "FileMind Intelligence is disabled in this environment.", 409);
    const userId = await getUserId(); if (!userId) throw new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
    let snapshot = await workspaceRepository.get(userId, input.workspaceId);
    if (snapshot.revision !== input.revision) throw new WorkspaceError("CONFLICT", "Workspace changed. Reload before analysis.", 409);
    if (snapshot.run && !["failed", "cancelled"].includes(snapshot.run.status)) throw new WorkspaceError("INVALID_STATE", "This workspace already has an active or completed run.", 409);
    // Configuration failure is surfaced, so browser can explicitly continue locally.
    const provider = getAIProvider();
    const analysisSnapshot = snapshot;
    const controller = new AbortController(); const abort = () => controller.abort(); request.signal.addEventListener("abort", abort, { once: true });
    const stream = new ReadableStream<Uint8Array>({
      async start(output) {
        const encoder = new TextEncoder();
        try {
          await new LLMAgentRunner(provider, getAnalysisCache(userId, snapshot.id), (workspace, documentId, signal, event) => analyzeWorkspaceImage(userId, workspace, documentId, signal, event)).execute(analysisSnapshot, input.runId, async run => {
            snapshot = await workspaceRepository.save(userId, { ...snapshot, texts: analysisSnapshot.texts, run, documents: run.documents, proposal: run.result ?? null });
            if (!controller.signal.aborted) output.enqueue(encoder.encode(`${JSON.stringify({ run, revision: snapshot.revision })}\n`));
          }, controller.signal);
        } catch { if (!controller.signal.aborted) output.enqueue(encoder.encode(`${JSON.stringify({ error: "Workspace could not be saved. Retry or reload to recover." })}\n`)); }
        finally { request.signal.removeEventListener("abort", abort); if (!controller.signal.aborted) output.close(); }
      }, cancel() { controller.abort(); },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) { return apiError(error); }
}
