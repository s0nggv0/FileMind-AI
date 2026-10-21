import { database } from "@/lib/server/database";
import { getUserId } from "@/lib/server/identity";
import { apiError, readJSON, sameOrigin } from "@/lib/server/http";
import { DuplicateReviewSchema, updateDuplicateReview } from "@/lib/workspace/duplicate-review";
import { WorkspaceError } from "@/lib/workspace/authorization";
export async function PATCH(request: Request) {
  try { sameOrigin(request); const userId=await getUserId(); if(!userId)throw new WorkspaceError("NOT_FOUND","重复候选不存在或无法访问。",404);
    const input=DuplicateReviewSchema.parse(await readJSON(request,4096)); return Response.json(await updateDuplicateReview(database,userId,input),{headers:{"cache-control":"private, no-store"}});
  } catch(error){return apiError(error);}
}
