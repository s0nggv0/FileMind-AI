"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { documentReadiness, type ReadinessDocument } from "@/lib/retrieval/readiness";
import { prepareSearch } from "@/lib/retrieval/prepare-search";
export function KnowledgeIndex({ documentId }: { documentId: string }) {
  const [status, setStatus] = useState<ReadinessDocument | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const read = () => { void fetch("/api/index", { signal: abort.signal }).then(async r => { if (!r.ok) throw new Error("索引状态暂时不可用，请重试。"); return r.json(); }).then(data => { if (!abort.signal.aborted) { setStatus(data.documents?.find((d: ReadinessDocument) => d.id === documentId) ?? null); setError(""); } }).catch(() => { if (!abort.signal.aborted) setError("索引状态暂时不可用，请重试。"); }); };
    read(); const timer = setInterval(read, 3000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [documentId]);
  async function reindex() {
    setBusy(true); setError("");
    try { const refreshed = await prepareSearch({ documentIds: [documentId] }); setStatus(refreshed.documents[0] ?? null); }
    catch (e) { setError(e instanceof Error ? e.message : "索引暂时不可用。"); }
    finally { setBusy(false); }
  }
  const state = status ? documentReadiness(status) : null;
  return <div className="space-y-2 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div>
    <h3 className="text-xs font-medium">搜索准备</h3>
    <p role="status" className="mt-2 text-xs text-muted-foreground">{state?.semantic ? `可搜索 · ${status!.chunks} 个资料片段` : state?.searchable ? "已提取文字可用于关键词搜索 · 按含义搜索尚未就绪" : status?.status === "stale" ? "资料或模型已变更，需要重新建立索引。" : "已保存，但没有可搜索片段。请检查提取全文或重试。"}</p>
    {(busy || state?.processing) && <p role="status" className="mt-2 text-xs text-muted-foreground">正在建立替换索引。成功后会一次切换。{state?.searchable && "当前索引仍可搜索。"}</p>}
    {state?.replacementFailed && <p role="status" className="mt-2 text-xs text-muted-foreground">新索引失败或中断，可以重试。{state.searchable && "当前索引仍可搜索。"}</p>}
    {state?.partialCapabilities && <p className="mt-2 text-xs text-muted-foreground">图片能力部分完成；已有成功结果保留，可重试未完成能力。</p>}
  </div>{state?.retryable && <Button size="sm" variant="outline" disabled={busy} onClick={() => void reindex()}>准备或重试搜索</Button>}</div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
