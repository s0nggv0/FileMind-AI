import "server-only";
import { BackupService } from "../backup/service";
import { compatibility, BackupError, BACKUP_LIMITS } from "../backup/format";
import { database, persistenceConfigured } from "./database";
import { configuredEmbedding } from "./knowledge";
import { WorkspaceError } from "../workspace/authorization";

export function backupService() {
  if (!persistenceConfigured()) throw new BackupError("Backup requires FileMind database storage.", 503);
  return new BackupService(database, process.env.FILE_STORAGE_ROOT?.trim() || ".filemind/storage", compatibility(configuredEmbedding()?.getModelInfo() ?? null));
}
export const backupHeaders = { "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
export function backupError(error: unknown) {
  return Response.json({ error: error instanceof BackupError || error instanceof WorkspaceError ? error.message : "Backup is temporarily unavailable. Please retry." }, { status: error instanceof BackupError || error instanceof WorkspaceError ? error.status : 503, headers: backupHeaders });
}
export async function readBackup(request: Request) {
  if (Number(request.headers.get("content-length")) > BACKUP_LIMITS.archiveBytes) throw new BackupError("Backup exceeds supported limits.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new BackupError("Choose a FileMind backup first.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > BACKUP_LIMITS.archiveBytes) { await reader.cancel(); throw new BackupError("Backup exceeds supported limits.", 413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
