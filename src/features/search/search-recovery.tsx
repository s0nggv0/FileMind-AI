import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { searchIssueCopy, type SearchIssue } from "@/lib/retrieval/search-outcome";
import type { SearchResult } from "@/lib/retrieval/search-contract";
import type { RAGSource } from "@/lib/retrieval/rag";

export function SearchRecovery({ issues, busy, preparing, canPrepare, hasSources, onPrepare, onEdit, onSources, onRetry }: {
  issues: SearchIssue[]; busy: boolean; preparing: boolean; canPrepare: boolean; hasSources: boolean;
  onPrepare(): void; onEdit(): void; onSources(): void; onRetry(): void;
}) {
  if (!issues.length) return null;
  const actions = new Set(issues.flatMap(issue => searchIssueCopy[issue].actions));
  return <section aria-label="搜索说明与恢复操作" className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
    <div role="status" className="space-y-4">{issues.map(issue => <div key={issue}>
      <h3 className="text-sm font-semibold">{searchIssueCopy[issue].title}</h3>
      <p className="mt-1 text-sm leading-7 text-muted-foreground">{searchIssueCopy[issue].description}</p>
    </div>)}</div>
    <div className="flex flex-wrap gap-2">
      {actions.has("prepare") && canPrepare && <Button type="button" variant="outline" disabled={busy || preparing} onClick={onPrepare}>{preparing && <Loader2 size={14} className="animate-spin" />}{preparing ? "正在准备未完成资料…" : "准备未完成资料"}</Button>}
      {actions.has("sources") && hasSources && <Button type="button" variant="outline" onClick={onSources}>查看相关原文</Button>}
      {actions.has("edit") && <Button type="button" variant="outline" disabled={busy || preparing} onClick={onEdit}>调整问题</Button>}
      {actions.has("retry") && <Button type="button" variant="outline" disabled={busy || preparing} onClick={onRetry}>在当前范围重试</Button>}
    </div>
    <p className="text-xs leading-6 text-muted-foreground">恢复操作沿用当前身份、工作区和文档范围。准备完成后请手动搜索。</p>
  </section>;
}

export function PreviousSearchResult({ result, onPreview }: { result: SearchResult; onPreview(source: RAGSource): void }) {
  return <article className="space-y-3 rounded-lg border p-4">
    <h3 className="text-sm font-semibold">{result.mode === "ask" ? "上次已通过验证的结果" : "上次找到的资料片段"}</h3>
    <p className="break-words text-sm text-muted-foreground">当时的问题：{result.query}。此结果仅反映当时的资料。</p>
    {result.mode === "ask" && <p className="whitespace-pre-wrap break-words text-base leading-8">{result.answer!.answer}</p>}
    <div className="divide-y">{result.sources.map(item => <button key={item.id} type="button" className="block min-h-11 w-full space-y-2 py-3 text-left" onClick={() => onPreview(item)}>
      <span className="block break-words text-sm text-primary">[{item.sourceId}] {item.documentName} · {item.location}</span>
      <span className="line-clamp-3 block whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{item.content}</span>
    </button>)}</div>
  </article>;
}
