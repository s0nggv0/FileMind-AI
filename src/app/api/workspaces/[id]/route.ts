import { z } from "zod";
import { getUserId } from "@/lib/server/identity";
import { workspaceRepository } from "@/lib/server/workspace-repository";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { recoverSnapshot, OrganizationProposalSchema, WorkspaceSnapshotSchema } from "@/lib/workspace/schemas";
import { validateReview, WorkspaceError } from "@/lib/workspace/authorization";
import { sanitizeFilename } from "@/lib/ai/input-guard";
import { scheduleKnowledgeIndex } from "@/lib/server/knowledge";
type Context = { params: Promise<{ id: string }> };
async function owned(context: Context) {
  const id = z.uuid().parse((await context.params).id); const user = await getUserId();
  if (!user) throw new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
  return { user, snapshot: await workspaceRepository.get(user, id) };
}
export async function GET(_request: Request, context: Context) {
  try { return Response.json(recoverSnapshot((await owned(context)).snapshot)); } catch (error) { return apiError(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    sameOrigin(request); const { user, snapshot } = await owned(context);
    const next = WorkspaceSnapshotSchema.parse(await readJSON(request));
    if (next.id !== snapshot.id || next.revision !== snapshot.revision) throw new WorkspaceError("CONFLICT", "Workspace changed. Reload before saving.", 409);
    // Browser snapshots are only permitted for mock runs. LLM results are server-owned.
    if (next.run?.engine === "llm" || snapshot.run?.engine === "llm") throw new WorkspaceError("INVALID_STATE", "AI runs are saved by the server.", 403);
    if (snapshot.run?.status === "completed" && next.run?.id === snapshot.run.id) throw new WorkspaceError("INVALID_STATE", "Completed runs are immutable.", 409);
    if (snapshot.documents.length && (snapshot.documents.length !== next.documents.length || snapshot.documents.some(d => !next.documents.some(item => item.id === d.id)))) throw new WorkspaceError("INVALID_STATE", "Saved document identities cannot be changed.");
    if (next.documents.some(d => { const old = snapshot.documents.find(p => p.id === d.id); return old && (old.name !== d.name || old.type !== d.type || old.size !== d.size || old.mimeType !== d.mimeType); })) throw new WorkspaceError("INVALID_STATE", "Original document metadata is immutable.");
    if (next.documents.some(d => d.storagePath && d.storagePath !== snapshot.documents.find(p => p.id === d.id)?.storagePath)) throw new WorkspaceError("INVALID_STATE", "Storage references are server-owned.");
    const saved = await workspaceRepository.save(user, next);
    if (next.run?.status === "completed") scheduleKnowledgeIndex({ userId: user, workspaceId: next.id });
    return Response.json(saved);
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    sameOrigin(request); const { user, snapshot } = await owned(context);
    const body = z.object({ action: z.enum(["review", "apply", "resume"]), revision: z.number().int().nonnegative(), proposal: OrganizationProposalSchema.optional() }).parse(await readJSON(request));
    if (body.revision !== snapshot.revision) throw new WorkspaceError("CONFLICT", "Workspace changed. Reload before saving.", 409);
    if (body.action === "resume") {
      if (!snapshot.run || !["running", "planning", "failed", "cancelled"].includes(snapshot.run.status)) throw new WorkspaceError("INVALID_STATE", "This run cannot resume.", 409);
      snapshot.run = null; snapshot.proposal = null;
    } else {
      if (!body.proposal) throw new WorkspaceError("INVALID_STATE", "Missing proposal.");
      validateReview(snapshot, body.proposal); snapshot.proposal = body.proposal;
      if (body.action === "apply" && snapshot.run) {
        snapshot.proposal.documents = snapshot.proposal.documents.map(d => ({ ...d, name: d.renameDecision === "accepted" && d.suggestedName ? sanitizeFilename(d.suggestedName, d.originalName) : d.originalName }));
        snapshot.run.status = "completed"; snapshot.run.completedAt = Date.now(); snapshot.run.result = structuredClone({ ...snapshot.proposal, relationships: snapshot.proposal.relationships.filter(r => r.decision !== "ignored") });
      }
    }
    const saved = await workspaceRepository.save(user, snapshot);
    if (body.action === "apply") scheduleKnowledgeIndex({ userId: user, workspaceId: snapshot.id });
    return Response.json(saved);
  } catch (error) { return apiError(error); }
}
