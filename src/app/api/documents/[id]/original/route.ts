import { z } from "zod";
import { createHash } from "node:crypto";
import { database } from "@/lib/server/database";
import { getUserId } from "@/lib/server/identity";
import { getFileStorage } from "@/lib/server/file-storage";
import { apiError } from "@/lib/server/http";
import { WorkspaceError } from "@/lib/workspace/authorization";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserId(); if (!userId) throw new WorkspaceError("NOT_FOUND", "Original file not found.", 404);
    const id = z.uuid().parse((await context.params).id);
    const result = await database.query(userId, "select workspace_id,original_name,file_type,content_hash from filemind.documents where user_id=$1 and id=$2 and storage_path is not null and storage_status='available'", [userId, id]);
    const doc = result.rows[0] as { workspace_id: string; original_name: string; file_type: string; content_hash: string } | undefined;
    if (!doc) throw new WorkspaceError("NOT_FOUND", "Original file not found.", 404);
    const extension = doc.original_name.split(".").at(-1)!.toLowerCase();
    const bytes = await getFileStorage().readOriginal({ userId, workspaceId: doc.workspace_id, documentId: id, extension });
    if (createHash("sha256").update(bytes).digest("hex") !== doc.content_hash) throw new WorkspaceError("UNAVAILABLE", "Original file integrity check failed.", 503);
    const mime = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" }[extension] || "application/octet-stream";
    return new Response(new Uint8Array(bytes), { headers: { "content-type": mime, "content-disposition": `${extension === "docx" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", "referrer-policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}
