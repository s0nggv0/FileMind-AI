import { z } from "zod";
import { getUserId } from "@/lib/server/identity";
import { imageSource, multimodalRepository } from "@/lib/server/multimodal";
import { getFileStorage } from "@/lib/server/file-storage";
import { apiError } from "@/lib/server/http";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { database } from "@/lib/server/database";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserId(); if (!userId) throw new WorkspaceError("NOT_FOUND", "Image not found.", 404);
    const id = z.uuid().parse((await context.params).id); const doc = await imageSource({ userId }, id);
    if (new URL(request.url).searchParams.get("original") === "1") {
      const bytes = await getFileStorage().readOriginal({ userId, workspaceId: doc.workspace_id, documentId: id, extension: doc.original_name.split(".").at(-1)!.toLowerCase() });
      return new Response(new Uint8Array(bytes), { headers: { "content-type": doc.mime_type, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } });
    }
    const related = await database.query(userId, `select d.id,d.display_name as name,d.file_type as type from filemind.documents d
      where d.user_id=$1 and d.id<>$2 and exists(select 1 from filemind.document_tags a join filemind.document_tags b on lower(a.tag)=lower(b.tag) and a.user_id=b.user_id where a.document_id=$2 and b.document_id=d.id and a.user_id=$1 and lower(a.tag) not in ('image','document')) order by d.display_name limit 10`, [userId, id]);
    return Response.json({ id, filename: doc.display_name, width: doc.image_width, height: doc.image_height, analysis: await multimodalRepository.get({ userId }, id), related: related.rows }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
