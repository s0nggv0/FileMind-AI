import type { TransactionalTenantDatabase } from "../workspace/postgres-repository";
import { OperationJournal } from "../reliability/operation-journal";
import { documentReadiness } from "./readiness";
import { IndexStatusRepository } from "./index-status";
import type { RetrievalScope } from "./types";
import { WorkspaceError } from "../workspace/authorization";

// This lock covers image preparation AND private index construction. The journal's
// existing index lock and generation checks continue to guard publication.
export async function prepareDocument<T>(db: TransactionalTenantDatabase, scope: RetrievalScope, documentId: string, work: () => Promise<T>) {
  return new OperationJournal(db).lock(scope.userId, `prepare:${documentId}`, async () => {
    const result = await new IndexStatusRepository(db).page({ ...scope, documentIds: scope.documentIds && !scope.documentIds.includes(documentId) ? [] : [documentId] });
    const document = result.documents[0];
    if (!document) throw new WorkspaceError("NOT_FOUND", "部分选定资料暂无法确认，请重新打开资料后重试。", 404);
    if (!documentReadiness(document).retryable) return [{ documentId, status: document.status === "ready" ? "ready" : "failed", chunks: document.chunks, skipped: true }];
    return work();
  });
}
