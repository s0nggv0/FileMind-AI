import { z } from "zod";
import { PostgresWorkspaceRepository, type TransactionalTenantDatabase } from "./postgres-repository";
import { WorkspaceError } from "./authorization";
export const DuplicateReviewSchema = z.object({ workspaceId:z.uuid(), candidateId:z.string().min(1).max(150), revision:z.number().int().nonnegative(), decision:z.enum(["pending","accepted","ignored"]) }).strict();
export async function updateDuplicateReview(db: TransactionalTenantDatabase, userId: string, input: z.infer<typeof DuplicateReviewSchema>) {
  const patch=DuplicateReviewSchema.parse(input);
  return db.transaction(userId,async tx => {
    await tx.query("select id from filemind.workspaces where user_id=$1 and id=$2 for update",[userId,patch.workspaceId]);
    const repository=new PostgresWorkspaceRepository({query:(_u,s,p)=>tx.query(s,p)});
    const snapshot=await repository.get(userId,patch.workspaceId);
    if(snapshot.revision!==patch.revision)throw new WorkspaceError("CONFLICT","审阅记录已更新，请刷新后再决定。",409);
    const candidate=snapshot.proposal?.duplicates.find(c=>c.id===patch.candidateId);
    if(!candidate || snapshot.run?.status!=="completed")throw new WorkspaceError("NOT_FOUND","重复候选不存在或无法访问。",404);
    candidate.decision=patch.decision;
    snapshot.run.result=structuredClone(snapshot.proposal!);
    const next=await repository.save(userId,snapshot);
    return {revision:next.revision,decision:candidate.decision};
  });
}
