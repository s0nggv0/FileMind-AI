import { z } from "zod";
import { getUserId } from "@/lib/server/identity";
import { workspaceRepository } from "@/lib/server/workspace-repository";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { recoverSnapshot, WorkspaceUpdateSchema, WorkspaceSnapshotSchema } from "@/lib/workspace/schemas";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { applyWorkspacePlan, prepareMockWorkspaceSave, resumeWorkspace, reviewWorkspace } from "@/lib/workspace/workspace-updates";
import { scheduleKnowledgeIndex } from "@/lib/server/knowledge";
import { workspaceOperations, recoverTenantBeforeAccess } from "@/lib/server/reliability";
type Context = { params: Promise<{ id: string }> };
async function owned(context: Context) {
  const id = z.uuid().parse((await context.params).id); const user = await getUserId();
  await recoverTenantBeforeAccess(user);
  if (!user) throw new WorkspaceError("NOT_FOUND", "工作区不存在或无法访问。", 404);
  return { user, snapshot: await workspaceRepository.get(user, id) };
}
export async function GET(_request: Request, context: Context) {
  try { return Response.json(recoverSnapshot((await owned(context)).snapshot)); } catch (error) { return apiError(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    sameOrigin(request); const { user, snapshot } = await owned(context);
    const next = prepareMockWorkspaceSave(snapshot, WorkspaceSnapshotSchema.parse(await readJSON(request)));
    const saved = next.run?.status === "completed" ? await workspaceOperations().apply(user, next) : await workspaceRepository.save(user, next);
    if (next.run?.status === "completed") await scheduleKnowledgeIndex({ userId: user, workspaceId: next.id });
    return Response.json(saved);
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    sameOrigin(request); const { user, snapshot } = await owned(context);
    const body = WorkspaceUpdateSchema.parse(await readJSON(request));
    const next = body.action === "resume" ? resumeWorkspace(snapshot, body.revision)
      : body.action === "review" ? reviewWorkspace(snapshot, body.revision, body.proposal)
      : applyWorkspacePlan(snapshot, body.revision, body.proposal);
    const saved = body.action === "apply" ? await workspaceOperations().apply(user, next) : await workspaceRepository.save(user, next);
    if (body.action === "apply") await scheduleKnowledgeIndex({ userId: user, workspaceId: next.id });
    return Response.json(saved);
  } catch (error) { return apiError(error); }
}
