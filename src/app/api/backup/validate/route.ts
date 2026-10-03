import { backupService, backupError, backupHeaders, readBackup } from "@/lib/server/backup";
import { sameOrigin } from "@/lib/server/http";
import { getUserId } from "@/lib/server/identity";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request); const service = backupService(); const bytes = await readBackup(request);
    const userId = await getUserId();
    return Response.json(userId ? await service.preview(userId, bytes) : { ...service.validate(bytes).preview, duplicates: 0 }, { headers: backupHeaders });
  } catch (error) { return backupError(error); }
}
