import { z } from "zod";
import { getUserId } from "@/lib/server/identity";
import { workspaceRepository } from "@/lib/server/workspace-repository";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { recoverSnapshot, OrganizationProposalSchema, WorkspaceSnapshotSchema } from "@/lib/workspace/schemas";
import { validateReview, WorkspaceError } from "@/lib/workspace/authorization";
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
    if (next.documents.some(d => d.storagePath && d.storagePath !== snapshot.documents.find(p => p.id === d.id)?.storagePath)) throw new WorkspaceError("INVALID_STATE", "Storage references are server-owned.");
    return Response.json(await workspaceRepository.save(user, next));
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
        snapshot.proposal.documents = snapshot.proposal.documents.map(d => ({ ...d, name: d.renameDecision === "accepted" && d.suggestedName ? d.suggestedName : d.originalName }));
        snapshot.run.status = "completed"; snapshot.run.completedAt = Date.now(); snapshot.run.result = structuredClone(snapshot.proposal);
      }
    }
    return Response.json(await workspaceRepository.save(user, snapshot));
  } catch (error) { return apiError(error); }
}
