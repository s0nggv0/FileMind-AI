import { z } from "zod";
import { getUserId } from "@/lib/server/identity";
import { imageSource, multimodalRepository } from "@/lib/server/multimodal";
import { getFileStorage } from "@/lib/server/file-storage";
import { apiError } from "@/lib/server/http";
import { WorkspaceError } from "@/lib/workspace/authorization";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserId(); if (!userId) throw new WorkspaceError("NOT_FOUND", "图片不存在或无法访问。", 404);
    const id = z.uuid().parse((await context.params).id); const doc = await imageSource({ userId }, id);
    if (new URL(request.url).searchParams.get("original") === "1") {
      if(doc.storage_status!=="available")throw new WorkspaceError("NOT_FOUND","原图不可用，仍可查看已保存的分析结果。",404);
      const bytes = await getFileStorage().readOriginal({ userId, workspaceId: doc.workspace_id, documentId: id, extension: doc.original_name.split(".").at(-1)!.toLowerCase() });
      return new Response(new Uint8Array(bytes), { headers: { "content-type": doc.mime_type, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } });
    }
    return Response.json({ id, filename: doc.display_name, width: doc.image_width, height: doc.image_height,storageStatus:doc.storage_status, analysis: await multimodalRepository.get({ userId }, id), related: await multimodalRepository.related({ userId }, id) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
