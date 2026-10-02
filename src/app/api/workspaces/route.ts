import { z } from "zod";
import { getUserId } from "@/lib/server/identity";
import { workspaceRepository } from "@/lib/server/workspace-repository";
import { persistenceConfigured } from "@/lib/server/supabase";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
export async function GET() {
  try {
    if (!persistenceConfigured()) return Response.json({ workspaces: [], persistent: false });
    const userId = await getUserId();
    return Response.json({ workspaces: userId ? await workspaceRepository.list(userId) : [], persistent: true });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { sameOrigin(request); const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(await readJSON(request, 1024));
    return Response.json(await workspaceRepository.create((await getUserId(true))!, name), { status: 201 });
  } catch (error) { return apiError(error); }
}
