import type { ReadinessDocument } from "./readiness";

interface PreparationScope { workspaceId?: string; documentIds?: string[] }
interface IndexResult { documentId: string; status: "ready" | "failed"; chunks?: number }

// Resolve the scope from fresh status, then issue only document-specific requests.
// No empty POST can fall back to preparing the entire personal library.
export async function prepareSearch(scope: PreparationScope, transport: typeof fetch = fetch) {
  if (scope.documentIds && !scope.documentIds.length) throw new Error("未选择资料，请重新选择后准备搜索。");
  const response = await transport("/api/index", { cache: "no-store" });
  if (!response.ok) throw new Error("暂时无法确认资料准备状态，请稍后重试。");
  const data = await response.json() as { documents: ReadinessDocument[] };
  const selected = data.documents.filter(d => (!scope.workspaceId || d.workspaceId === scope.workspaceId) && (!scope.documentIds || scope.documentIds.includes(d.id)));
  if (scope.documentIds?.some(id => !selected.some(d => d.id === id))) throw new Error("部分选定资料暂无法确认，请重新打开资料后重试。");
  const processing = selected.filter(d => ["chunking", "embedding"].includes(d.buildStatus ?? ""));
  const unfinished = selected.filter(d => !processing.includes(d) && (d.status !== "ready" || !d.chunks || ["failed", "interrupted"].includes(d.buildStatus ?? "")));
  const results: IndexResult[] = [];
  for (const document of unfinished) {
    const prepared = await transport("/api/index", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentId: document.id, ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}) }),
    });
    if (!prepared.ok) throw new Error("部分资料尚未准备完成，已有结果保留，请稍后重试。");
    const body = await prepared.json() as { results: IndexResult[] };
    const result = body.results.find(r => r.documentId === document.id && ["ready", "failed"].includes(r.status));
    if (!result) throw new Error("未能确认资料的准备结果，请稍后重新检查状态。");
    results.push(result);
  }
  return { results, processing: processing.length };
}
