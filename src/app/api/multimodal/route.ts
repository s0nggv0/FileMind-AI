import { z } from "zod";
import { getUserId } from "@/lib/server/identity";
import { workspaceRepository } from "@/lib/server/workspace-repository";
import { analyzeWorkspaceImage } from "@/lib/server/multimodal";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { WorkspaceError } from "@/lib/workspace/authorization";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    sameOrigin(request); const userId = await getUserId(); if (!userId) throw new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
    const input = z.object({ workspaceId: z.uuid(), documentId: z.uuid().optional() }).strict().parse(await readJSON(request, 2048));
    const snapshot = await workspaceRepository.get(userId, input.workspaceId);
    if (snapshot.run && ["planning", "running", "applying"].includes(snapshot.run.status)) throw new WorkspaceError("CONFLICT", "Image analysis is already active.", 409);
    const activity: string[] = [];
    for (const doc of snapshot.documents.filter(d => d.type === "image" && (!input.documentId || d.id === input.documentId))) await analyzeWorkspaceImage(userId, snapshot, doc.id, request.signal, async message => { activity.push(message); });
    return Response.json({ snapshot: await workspaceRepository.save(userId, snapshot), activity });
  } catch (error) { return apiError(error); }
}
