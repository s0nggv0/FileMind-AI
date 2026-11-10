"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { stateLabel } from "@/lib/ui-labels";
import type { SearchResult } from "@/lib/retrieval/search-contract";
import { hasVerifiedAnswer, type SearchIssue } from "@/lib/retrieval/search-outcome";
import type { RAGSource } from "@/lib/retrieval/answer-contract";
import { PreviousSearchResult } from "./search-recovery";
import { SearchPassages, SearchSources } from "./search-sources";

export function SearchResults({ result, retainedSuccess, busy, indexing, issues, onSearch: search, onPreview: preview }: {
  result: SearchResult; retainedSuccess: SearchResult | null; busy: boolean; indexing: boolean; issues: SearchIssue[];
  onSearch(clarificationOption?: number, compareAll?: boolean): void;
  onPreview(source: RAGSource, runId?: string): void;
}) {
  const restoredCitation = useRef("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), chunkId = params.get("focusChunk");
    if (!result || !chunkId || !result.sources.some(source => source.id === chunkId)) return;
    const key = `${result.id}:${chunkId}`;
    if (restoredCitation.current === key) return;
    const button = document.querySelector<HTMLButtonElement>(`[data-citation-chunk="${chunkId}"]`);
    if (button) { restoredCitation.current = key; button.focus({ preventScroll: true }); button.scrollIntoView({ block: "center" }); }
  }, [result]);
  const shownSources = result.sources.length ? result.sources : result.nearest;
  const nearestOnly = !result.sources.length;
  return (
    <section className="grid min-w-0 gap-8 border-t pt-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {result.historyWarning && <p role="status" className="rounded-lg border p-4 text-sm leading-7">{result.historyWarning}</p>}
        {result.coverage && <div role="status" className="space-y-2 rounded-lg border p-4 text-sm leading-7">
          <p>比较范围 {result.coverage.selectedCount} 份 · 参与证据 {result.coverage.evidenceDocumentIds.length} 份 · 合并副本 {result.coverage.mergedCopies.length} 份{result.mode === "ask" && ` · 回答引用 ${result.coverage.citedDocumentIds.length} 份`}</p>
          <p className="text-muted-foreground">{result.coverage.complete ? "当前范围的来源均已参与；证据覆盖不代表每份资料包含全部请求事实。" : "本次仅覆盖部分来源，不能视为完整比较。候选、证据和上下文预算保持有界；可缩小范围分批比较。"}</p>
          {result.coverage.uncovered.map(item => <p key={item.documentId} className="break-words text-muted-foreground">{item.name}：{({not_ready:"索引尚未就绪",no_relevant_evidence:"未召回足够相关证据（可能受候选预算限制）",budget:"未进入本次证据或上下文预算",not_cited:"尚无通过验证的回答引用支持所请求事实",missing_facts:"参与证据，但缺少请求事实"})[item.reason]}{item.detail && ` · ${item.detail}`}</p>)}
          {result.coverage.unlistedCount > 0 && <p>另有 {result.coverage.unlistedCount} 份超出本次来源统计预算。</p>}
        </div>}
        <p className="break-words text-sm text-muted-foreground">{busy ? "正在处理新请求，以下保留上次结果" : "本次搜索"}：{result.query}</p>
        {!issues.length && <Button variant="outline" size="sm" disabled={busy || indexing} onClick={() => void search()}>{result.mode === "ask" ? "重新搜索并生成回答" : "重新搜索"}</Button>}
        {hasVerifiedAnswer(result) && result.answer?.conflict?.detected && <section role="status" className="space-y-3 rounded-lg border p-4"><h3 className="text-sm font-semibold">发现来源冲突</h3><p className="text-sm leading-7 text-muted-foreground">资料包含不同的值。FileMind 保留双方来源，缺少额外依据时不替你判断哪一方正确。</p>{result.answer.conflict.claims.map((claim, i) => <div key={i} className="space-y-2"><p className="break-words text-sm font-medium">{claim.topic}</p>{claim.sourceIds.map((id, j) => { const item = result.sources.find(s => s.sourceId === id); return item ? <button key={`${id}-${j}`} type="button" onClick={() => void preview(item)} className="block min-h-11 w-full break-words text-left text-sm text-primary underline underline-offset-4">{item.documentName}: {claim.values[j]}</button> : null; })}</div>)}</section>}
        {result.answerState === "needs_clarification" && result.answer?.clarification?.required && <section role="status" className="space-y-4"><h3 className="text-sm font-semibold">请选择你要询问的对象</h3><p className="text-base leading-8">{result.answer.clarification.question}</p><div className="flex flex-wrap gap-3">{result.answer.clarification.options?.map((option, i) => <Button key={i} type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal text-left" disabled={busy} onClick={() => void search(i)}>{option.label}</Button>)}<Button type="button" variant="outline" disabled={busy} onClick={() => void search(undefined, true)}>比较全部</Button></div></section>}
        {result.mode === "ask" && hasVerifiedAnswer(result) && <article><h3 className="text-sm font-semibold">AI 回答</h3><p className="mt-2 text-sm text-muted-foreground">点击回答中的引用数字，核对原文上下文或打开原文件。</p><p className="mt-4 whitespace-pre-wrap text-base leading-8">{result.answer!.answer.split(/(\[S\d+\])/g).map((part, i) => {
          const match = /^\[S(\d+)\]$/.exec(part); if (!match) return <span key={i}>{part}</span>;
          const item = result.sources.find(s => s.sourceId === `S${match[1]}`); if (!item) return null;
          return <button key={i} type="button" aria-label={`引用 ${match[1]}`} data-citation-chunk={item.id} title={`${item.documentName} · ${item.location}\n${item.content.slice(0, 240)}`} onClick={() => void preview(item)} className="mx-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary/10 px-1.5 text-sm font-medium text-primary">[{match[1]}]</button>;
        })}</p></article>}
        {retainedSuccess && <PreviousSearchResult result={retainedSuccess} onPreview={item => preview(item, retainedSuccess.id)} />}
        <SearchPassages sources={shownSources} nearestOnly={nearestOnly} onPreview={preview} />
        <p className="text-xs text-muted-foreground">{result.candidateCount} 个候选段落 · {result.evidenceCount} 个证据段落{result.answer && !result.answer.insufficientEvidence && ` · 依据支持程度： ${stateLabel(result.answer.confidence)}（依据支持程度，不是准确率）`}</p>
        {result.debug && <details className="rounded-lg border p-4"><summary className="cursor-pointer text-xs text-muted-foreground">检索调试信息</summary><pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">{JSON.stringify({ query: result.rewrittenQuery, ...result.debug, evidence: result.sources.map(s => ({ id: s.id, location: s.location })) }, null, 2)}</pre></details>}
      </div>
      <SearchSources sources={shownSources} nearestOnly={nearestOnly} onPreview={preview} />
    </section>
  );
}
