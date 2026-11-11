import { recoverTenantBeforeAccess } from "@/lib/server/reliability";
import { backupService, backupError, backupHeaders, readBackup } from "@/lib/server/backup";
import { sameOrigin } from "@/lib/server/http";
import { getOrCreateUserId } from "@/lib/server/identity";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request); const service = backupService(); const bytes = await readBackup(request);
    // Validate before creating an identity or touching the database/filesystem.
    service.validate(bytes);
    const userId = await getOrCreateUserId();
    await recoverTenantBeforeAccess(userId);
    const skipDuplicates = new URL(request.url).searchParams.get("skipDuplicates") !== "false";
    return Response.json(await service.import(userId, bytes, { skipDuplicates, signal: request.signal }), { headers: backupHeaders });
  } catch (error) { return backupError(error); }
}
