import { z } from "zod";
import { database } from "@/lib/server/database";
import { getUserId } from "@/lib/server/identity";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { DocumentReader, MetadataEditSchema } from "@/lib/workspace/document-reader";
import { WorkspaceError } from "@/lib/workspace/authorization";
async function identity(context: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(); if (!userId) throw new WorkspaceError("NOT_FOUND", "资料不存在或无法访问。", 404);
  return { userId, id: z.uuid().parse((await context.params).id) };
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { userId, id } = await identity(context); return Response.json(await new DocumentReader(database).get(userId, id), { headers: { "cache-control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { sameOrigin(request); const { userId, id } = await identity(context); const patch = MetadataEditSchema.parse(await readJSON(request, 8192)); return Response.json(await new DocumentReader(database).update(userId, id, patch), { headers: { "cache-control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
