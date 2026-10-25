import type { TransactionalTenantDatabase } from "../workspace/postgres-repository";
import { OperationJournal } from "../reliability/operation-journal";
import { documentReadiness, type ReadinessDocument } from "./readiness";
import type { RetrievalScope } from "./types";
import { WorkspaceError } from "../workspace/authorization";

// This lock covers image preparation AND private index construction. The journal's
// existing index lock and generation checks continue to guard publication.
export async function prepareDocument<T>(db: TransactionalTenantDatabase, scope: RetrievalScope, documentId: string, work: () => Promise<T>) {
  return new OperationJournal(db).lock(scope.userId, `prepare:${documentId}`, async () => {
    const result = await db.query(scope.userId, `select d.id,d.index_status as status,d.index_build_status as "buildStatus",d.file_type as "fileType",d.ocr_status as "ocrStatus",d.vision_status as "visionStatus",
      (select count(*)::integer from filemind.document_chunks c where c.user_id=$1 and c.document_id=d.id) as chunks
      from filemind.documents d where d.user_id=$1 and d.id=$2 and ($3::uuid is null or d.workspace_id=$3)`, [scope.userId, documentId, scope.workspaceId ?? null]);
    const document = result.rows[0] as ReadinessDocument | undefined;
    if (!document) throw new WorkspaceError("NOT_FOUND", "部分选定资料暂无法确认，请重新打开资料后重试。", 404);
    if (!documentReadiness(document).retryable) return [{ documentId, status: document.status === "ready" ? "ready" : "failed", chunks: document.chunks, skipped: true }];
    return work();
  });
}
