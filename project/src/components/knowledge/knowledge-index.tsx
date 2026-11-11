"use client";
import { Button } from "@/components/ui/button";
import { documentReadiness } from "@/lib/retrieval/readiness";
import { useIndexStatus } from "@/lib/retrieval/use-index-status";
import { useSearchPreparation } from "@/lib/retrieval/use-search-preparation";
export function KnowledgeIndex({ documentId }: { documentId: string }) {
  const { data, error, refresh } = useIndexStatus({ documentIds: [documentId] });
  const { run: reindex, busy, error: preparationError } = useSearchPreparation({ documentIds: [documentId] });
  const status = data?.documents.find(d => d.id === documentId);
  const state = status ? documentReadiness(status) : null;
  return <div className="space-y-2 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div>
    <h3 className="text-xs font-medium">搜索准备</h3>
    <p role="status" className="mt-2 text-xs text-muted-foreground">{state?.semantic ? `可搜索 · ${status!.chunks} 个资料片段` : state?.searchable ? "已提取文字可用于关键词搜索 · 按含义搜索尚未就绪" : status?.status === "stale" ? "资料或模型已变更，需要重新建立索引。" : "已保存，但没有可搜索片段。请检查提取全文或重试。"}</p>
    {(busy || state?.processing) && <p role="status" className="mt-2 text-xs text-muted-foreground">正在建立替换索引。成功后会一次切换。{state?.searchable && "当前索引仍可搜索。"}</p>}
    {state?.replacementFailed && <p role="status" className="mt-2 text-xs text-muted-foreground">新索引失败或中断，可以重试。{state.searchable && "当前索引仍可搜索。"}</p>}
    {state?.partialCapabilities && <p className="mt-2 text-xs text-muted-foreground">图片能力部分完成；已有成功结果保留，可重试未完成能力。</p>}
  </div>{state?.retryable && <Button size="sm" variant="outline" disabled={busy} onClick={() => void reindex()}>准备或重试搜索</Button>}</div>{(error || preparationError) && <div role="alert"><p className="text-xs text-destructive">{error || preparationError}</p><Button size="sm" variant="outline" onClick={() => void refresh().catch(() => {})}>刷新准备状态</Button></div>}</div>;
}
