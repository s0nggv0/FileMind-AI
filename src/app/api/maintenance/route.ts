import { getUserId } from "@/lib/server/identity";
import { persistenceConfigured } from "@/lib/server/database";
import { recoveryService } from "@/lib/server/reliability";
import { apiError, sameOrigin } from "@/lib/server/http";
import { WorkspaceError } from "@/lib/workspace/authorization";

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId || !persistenceConfigured()) return Response.json({ persistent:false,operations:[] });
    const rows = await recoveryService().journal.recent(userId);
    return Response.json({persistent:true,operations:rows.map(row=>({id:row.id,type:row.operation_type,status:row.status,stage:row.stage,errorCode:row.error_code,updatedAt:row.updated_at}))},{headers:{"cache-control":"private, no-store"}});
  } catch(error) {return apiError(error);}
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const userId = await getUserId();
    if (!userId || !persistenceConfigured()) throw new WorkspaceError("UNAVAILABLE","运行存储维护前，请先配置持久化存储。",503);
    return Response.json(await recoveryService().reconcile(userId),{headers:{"cache-control":"private, no-store"}});
  } catch(error) {return apiError(error);}
}
