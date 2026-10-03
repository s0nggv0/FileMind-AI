import { createHash } from "node:crypto";
import { z } from "zod";
import { uploadConfig } from "@/config/upload";
import { getUserId } from "@/lib/server/identity";
import { workspaceOperations } from "@/lib/server/reliability";
import { workspaceRepository } from "@/lib/server/workspace-repository";
import { sameOrigin, apiError } from "@/lib/server/http";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { validateImage } from "@/lib/multimodal/image-validation";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request); const id = z.uuid().parse((await context.params).id); const user = await getUserId();
    if (!user) throw new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
    const snapshot = await workspaceRepository.get(user, id);
    const limit = uploadConfig.maxFileBytes + 65536;
    if (Number(request.headers.get("content-length")) > limit) throw new WorkspaceError("INVALID_STATE", "Upload is too large.", 413);
    const reader = request.body?.getReader(); if (!reader) throw new WorkspaceError("INVALID_STATE", "Missing upload.");
    let length = 0; const chunks: Uint8Array[] = [];
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > limit) { await reader.cancel(); throw new WorkspaceError("INVALID_STATE", "Upload is too large.", 413); } chunks.push(part.value); }
    const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
    const documentId = z.uuid().parse(form.get("documentId")); const file = form.get("file");
    const document = snapshot.documents.find(d => d.id === documentId);
    if (!document || !(file instanceof File)) throw new WorkspaceError("NOT_FOUND", "Document not found.", 404);
    if (snapshot.run && !["failed", "cancelled"].includes(snapshot.run.status)) throw new WorkspaceError("INVALID_STATE", "Files are locked during this run.", 409);
    const extension = document.name.split(".").pop()?.toLowerCase() ?? "";
    if (!uploadConfig.extensions.includes(extension) || !uploadConfig.mimeTypes[extension]?.includes(document.mimeType) || file.size !== document.size || file.size > uploadConfig.maxFileBytes) throw new WorkspaceError("INVALID_STATE", "Invalid upload metadata.");
    const bytes = Buffer.from(await file.arrayBuffer()); const hash = createHash("sha256").update(bytes).digest("hex");
    if (document.type === "image") {
      if (file.type !== document.mimeType) throw new WorkspaceError("INVALID_STATE", "Image MIME does not match metadata.");
      try { const metadata = await validateImage(bytes, document.name, file.type); Object.assign(document.metadata, { width: metadata.width, height: metadata.height }); }
      catch { throw new WorkspaceError("INVALID_STATE", "Invalid image MIME, extension, signature or pixel data."); }
    }
    if (document.contentHash && hash !== document.contentHash) throw new WorkspaceError("INVALID_STATE", "File checksum mismatch.");
    return Response.json(await workspaceOperations().upload(user, snapshot, documentId, extension, bytes));
  } catch (error) { return apiError(error); }
}
