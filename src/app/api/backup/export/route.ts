import { backupService, backupError, backupHeaders } from "@/lib/server/backup";
import { sameOrigin } from "@/lib/server/http";
import { getUserId } from "@/lib/server/identity";
import { database } from "@/lib/server/database";
import { BackupError } from "@/lib/backup/format";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request); const service = backupService(); const userId = await getUserId();
    if (!userId) throw new BackupError("Create or recover a knowledge space before exporting.");
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) => { if (!cancelled && !request.signal.aborted) controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n")); };
        try {
          const result = await service.export(userId, stage => send({ type: "stage", stage }));
          request.signal.throwIfAborted();
          await database.query(userId, "update filemind.profiles set last_backup_at=$2 where id=$1", [userId, result.manifest.createdAt]);
          send({ type: "result", filename: `filemind-${result.manifest.createdAt.slice(0, 10)}.filemind-backup`, base64: Buffer.from(result.bytes).toString("base64"), createdAt: result.manifest.createdAt });
        } catch (error) { send({ type: "error", error: error instanceof BackupError ? error.message : "Export failed. Please retry." }); }
        finally { if (!cancelled) controller.close(); }
      },
      cancel() { cancelled = true; },
    });
    return new Response(stream, { headers: { ...backupHeaders, "content-type": "application/x-ndjson", "x-accel-buffering": "no" } });
  } catch (error) { return backupError(error); }
}
