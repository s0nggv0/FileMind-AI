import { z } from "zod";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { database, persistenceConfigured } from "@/lib/server/database";
import { getUserId, issueIdentityCookie } from "@/lib/server/identity";
import { IdentityRecoveryService, RecoveryError, INVALID_RECOVERY_KEY } from "@/lib/workspace/identity-recovery";
import { WorkspaceError } from "@/lib/workspace/authorization";
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const service = new IdentityRecoveryService(database);
export async function GET() {
  try {
    const userId = await getUserId();
    if (!persistenceConfigured() || !userId) return Response.json({ available: persistenceConfigured(), configured: false, lastBackupAt: null }, { headers });
    return Response.json({ available: true, ...await service.status(userId) }, { headers });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!persistenceConfigured()) throw new WorkspaceError("UNAVAILABLE", "Identity recovery requires FileMind database storage.", 503);
    const input = z.discriminatedUnion("action", [z.object({ action: z.literal("create") }).strict(), z.object({ action: z.literal("rotate") }).strict(), z.object({ action: z.literal("recover"), key: z.unknown().optional() }).strict()]).parse(await readJSON(request, 1024));
    if (input.action === "recover") {
      await issueIdentityCookie(await service.recover(typeof input.key === "string" ? input.key : ""));
      return Response.json({ recovered: true }, { headers });
    }
    const userId = await getUserId(input.action === "create");
    if (!userId) throw new WorkspaceError("NOT_FOUND", "A current identity is required.", 401);
    const key = await service.create(userId, input.action === "rotate");
    return Response.json({ key, configured: true }, { headers });
  } catch (error) {
    if (error instanceof RecoveryError) return Response.json({ error: INVALID_RECOVERY_KEY }, { status: error.status, headers: { ...headers, ...(error.status === 429 ? { "retry-after": "900" } : {}) } });
    return apiError(error);
  }
}
