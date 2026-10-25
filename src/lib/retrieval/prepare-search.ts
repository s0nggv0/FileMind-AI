import { documentReadiness, type ReadinessDocument } from "./readiness";

export interface PreparationScope { workspaceId?: string; documentIds?: string[] }
interface IndexResult { documentId: string; status: "ready" | "failed"; chunks?: number }
const active = new WeakMap<typeof fetch, Map<string, Promise<IndexResult>>>();

async function read(scope: PreparationScope, transport: typeof fetch) {
  const response = await transport("/api/index", { cache: "no-store" });
  if (!response.ok) throw new Error("暂时无法确认资料准备状态，请稍后重试。");
  const data = await response.json() as { documents: ReadinessDocument[] };
  const documents = data.documents.filter(d => (!scope.workspaceId || d.workspaceId === scope.workspaceId) && (!scope.documentIds || scope.documentIds.includes(d.id)));
  if (scope.documentIds?.some(id => !documents.some(d => d.id === id))) throw new Error("部分选定资料暂无法确认，请重新打开资料后重试。");
  return documents;
}

// Only document-specific requests; a second entry point joins the same work.
export async function prepareSearch(scope: PreparationScope, transport: typeof fetch = fetch) {
  if (scope.documentIds && !scope.documentIds.length) throw new Error("未选择资料，请重新选择后准备搜索。");
  const selected = await read(scope, transport);
  let pending = active.get(transport);
  if (!pending) { pending = new Map(); active.set(transport, pending); }
  const results: IndexResult[] = [];
  for (const document of selected.filter(d => documentReadiness(d).retryable)) {
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
    try { results.push(await work); }
    finally { if (pending.get(document.id) === work) pending.delete(document.id); }
  }
  // A successful request says nothing about the active index or partial image work.
  const documents = await read(scope, transport);
  return { results, processing: documents.filter(d => documentReadiness(d).processing).length, documents };
}
