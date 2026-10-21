import { database, persistenceConfigured } from "@/lib/server/database";
import { getUserId } from "@/lib/server/identity";
import { apiError } from "@/lib/server/http";
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId || !persistenceConfigured()) return Response.json({ documents: [] });
    const result = await database.query(userId, `select d.id,d.display_name as name,coalesce(d.summary,'') as summary,
      coalesce((select array_agg(t.tag) from filemind.document_tags t where t.user_id=$1 and t.document_id=d.id),'{}') as tags
      from filemind.documents d where d.user_id=$1 order by d.updated_at desc limit 1500`, [userId]);
    return Response.json({ documents: result.rows }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
