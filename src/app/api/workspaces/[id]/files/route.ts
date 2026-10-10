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
    if (!user) throw new WorkspaceError("NOT_FOUND", "工作区不存在或无法访问。", 404);
    const snapshot = await workspaceRepository.get(user, id);
    const limit = uploadConfig.maxFileBytes + 65536;
    if (Number(request.headers.get("content-length")) > limit) throw new WorkspaceError("INVALID_STATE", "上传文件超过大小限制。", 413);
    const reader = request.body?.getReader(); if (!reader) throw new WorkspaceError("INVALID_STATE", "请选择要上传的文件。");
    let length = 0; const chunks: Uint8Array[] = [];
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > limit) { await reader.cancel(); throw new WorkspaceError("INVALID_STATE", "上传文件超过大小限制。", 413); } chunks.push(part.value); }
    const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
    const documentId = z.uuid().parse(form.get("documentId")); const file = form.get("file");
    const document = snapshot.documents.find(d => d.id === documentId);
    if (!document || !(file instanceof File)) throw new WorkspaceError("NOT_FOUND", "资料不存在或无法访问。", 404);
    if (snapshot.run && !["failed", "cancelled"].includes(snapshot.run.status)) throw new WorkspaceError("INVALID_STATE", "整理执行期间，文件暂时锁定。", 409);
    const extension = document.name.split(".").pop()?.toLowerCase() ?? "";
    if (!uploadConfig.extensions.includes(extension) || !uploadConfig.mimeTypes[extension]?.includes(document.mimeType) || file.size !== document.size || file.size > uploadConfig.maxFileBytes) throw new WorkspaceError("INVALID_STATE", "上传的文件信息无效。");
    const bytes = Buffer.from(await file.arrayBuffer()); const hash = createHash("sha256").update(bytes).digest("hex");
    if (document.type === "image") {
      if (file.type !== document.mimeType) throw new WorkspaceError("INVALID_STATE", "图片类型与文件信息不一致。");
      try { const metadata = await validateImage(bytes, document.name, file.type); Object.assign(document.metadata, { width: metadata.width, height: metadata.height }); }
      catch { throw new WorkspaceError("INVALID_STATE", "图片类型、扩展名或文件内容无效。"); }
    }
    if (document.contentHash && hash !== document.contentHash) throw new WorkspaceError("INVALID_STATE", "文件校验和不匹配。");
    return Response.json(await workspaceOperations().upload(user, snapshot, documentId, extension, bytes));
  } catch (error) { return apiError(error); }
}
