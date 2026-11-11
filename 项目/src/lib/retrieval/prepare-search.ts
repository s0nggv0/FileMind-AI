import { documentReadiness, type ReadinessDocument } from "./readiness";
import type { IndexScope, IndexStatusPage } from "./index-status";
import { indexStatusClient, readIndexPage } from "./index-status-client";

export type PreparationScope = IndexScope;
interface IndexResult { documentId: string; status: "ready" | "failed"; chunks?: number; skipped?: boolean }
const active = new WeakMap<typeof fetch, Map<string, Promise<IndexResult>>>();

async function read(scope: PreparationScope, transport: typeof fetch, signal?: AbortSignal) {
  const documents: ReadinessDocument[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  do {
    const data = await readIndexPage(scope, transport, cursor, signal);
    documents.push(...data.documents);
    cursor = data.nextCursor ?? undefined;
    if (cursor && cursors.has(cursor)) throw new Error("未能完整读取准备范围，请重试。");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  if (scope.documentIds?.some(id => !documents.some(d => d.id === id))) throw new Error("部分选定资料暂无法确认，请重新打开资料后重试。");
  return documents;
}

// Only document-specific requests; a second entry point joins the same work.
export async function prepareSearch(scope: PreparationScope, transport: typeof fetch = fetch, signal?: AbortSignal) {
  if (scope.documentIds && !scope.documentIds.length) throw new Error("未选择资料，请重新选择后准备搜索。");
  const selected = await read(scope, transport, signal);
  let pending = active.get(transport);
  if (!pending) { pending = new Map(); active.set(transport, pending); }
  const results: IndexResult[] = [];
  let refreshed: IndexStatusPage | undefined;
  try { for (const document of selected.filter(d => documentReadiness(d).retryable)) {
    signal?.throwIfAborted();
    let work = pending.get(document.id);
    if (!work) {
      work = (async () => {
        const prepared = await transport("/api/index", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ documentId: document.id, unfinishedOnly: true, ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}) }),
        });
        if (!prepared.ok) throw new Error("部分资料尚未准备完成，已有结果保留，请稍后重试。");
        const body = await prepared.json() as { results: IndexResult[] };
        const result = body.results.find(r => r.documentId === document.id && ["ready", "failed"].includes(r.status));
        if (!result) throw new Error("未能确认资料的准备结果，请稍后重新检查状态。");
        return result;
      })();
      pending.set(document.id, work);
    }
    try { const result = await work; if (!result.skipped) results.push(result); }
    finally { if (pending.get(document.id) === work) pending.delete(document.id); }
  } } finally {
    // Refresh even after a failed POST; other mounted entries receive the same
    // authoritative snapshot. Pagination is needed for preparation, not polling.
    refreshed = await readIndexPage(scope, transport);
    if (transport === fetch) indexStatusClient.publish(scope, refreshed);
  }
  // A successful request says nothing about the active index or partial image work.
  return { results, processing: refreshed.summary.processing, documents: refreshed.documents, summary: refreshed.summary };
}
