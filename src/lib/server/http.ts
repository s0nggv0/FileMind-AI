import "server-only";
import { z } from "zod";
import { WorkspaceError } from "@/lib/workspace/authorization";
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new WorkspaceError("INVALID_STATE", "Request origin is not allowed.", 403);
}
export async function readJSON(request: Request, maxBytes = 32 * 1024 * 1024): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new WorkspaceError("INVALID_STATE", "Request is too large.", 413);
  const reader = request.body?.getReader(); if (!reader) throw new WorkspaceError("INVALID_STATE", "Missing request body.");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > maxBytes) { await reader.cancel(); throw new WorkspaceError("INVALID_STATE", "Request is too large.", 413); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new WorkspaceError("INVALID_STATE", "Invalid JSON request."); }
}
export function apiError(error: unknown) {
  if (error instanceof WorkspaceError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid request data.", code: "VALIDATION" }, { status: 400 });
  return Response.json({ error: "Service is temporarily unavailable.", code: "UNAVAILABLE" }, { status: 503 });
}
