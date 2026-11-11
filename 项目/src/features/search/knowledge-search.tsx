"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LibraryReadiness } from "@/components/knowledge/library-readiness";
import type { ReadinessDocument } from "@/lib/retrieval/readiness";
import { useSearchPreparation } from "@/lib/retrieval/use-search-preparation";
import { SearchRecovery } from "./search-recovery";
import type { RAGSource } from "@/lib/retrieval/answer-contract";
import { useKnowledgeSearch } from "./use-knowledge-search";
import { SearchResults } from "./search-results";
import { SearchCitation } from "./search-citation";
const suggestions = ["我哪些资料讲过 Transformer 的 Query、Key、Value？", "找出与数据库索引优化相关的资料", "哪些资料讲过注意力机制？"];
export function KnowledgeSearch({ persistent, mock, initialWorkspace, initialDocument, initialDocuments, initialQuery = "", initialMode = "ask" }: { persistent: boolean; mock: boolean; initialWorkspace?: string; initialDocument?: string; initialDocuments?: string[]; initialQuery?: string; initialMode?: "ask" | "find" }) {
  const [documents, setDocuments] = useState<ReadinessDocument[]>([]);
  const interaction = useKnowledgeSearch({ initialWorkspace, initialDocument, initialDocuments, initialQuery, initialMode });
  const { workspaceId, documentIds, query, setQuery, mode, setMode, result, retainedSuccess, recent, busy, stage, error, issues, openHistory, cancel } = interaction;
  const [selected, setSelected] = useState<RAGSource | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const preparation = useSearchPreparation({ workspaceId, documentIds });
  const indexing = preparation.busy;
  const [indexMessage, setIndexMessage] = useState<{ scope: string; text: string } | null>(null);
  const preparationScope = JSON.stringify([workspaceId, documentIds]);
  async function indexLibrary() {
    setIndexMessage(null);
    const outcome = await preparation.run();
    if (!outcome) return;
    const { results, processing, summary } = outcome;
    const failed = summary.retryable;
    setIndexMessage({ scope: preparationScope, text: failed ? `${failed} 份资料尚未准备完成，已有结果保留。请核对上方可搜索数量后重试。` : results.length ? `本次已准备 ${results.length} 份资料，其余已就绪或正在处理的资料未重复处理。` : processing ? `${processing} 份资料正在准备，请稍后查看搜索准备状态。` : "当前范围内暂无需要准备的资料。" });
  }

  function search(clarificationOption?: number, compareAll = false) {
    return interaction.search({ clarificationOption, compareAll, preparing: indexing });
  }
  function preview(item: RAGSource, runId = result?.id) {
    setSelected(item); setSelectedRunId(runId);
  }
  function editQuery() { document.getElementById("knowledge-query")?.focus(); document.getElementById("knowledge-query")?.scrollIntoView({ block: "center" }); }
  return <div className="mx-auto max-w-5xl space-y-9">
    <section className="mx-auto max-w-3xl pt-1 sm:pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{mode === "ask" ? "向资料提问" : "查找资料正文"}</h1>{(mock || result?.mock) && <Badge variant="outline">演示 / 模拟结果</Badge>}</div>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{mode === "ask" ? "从你的资料中找答案，点击引用核对原文。" : "查找资料正文与片段，点击查看原文。"}</p><div className="mt-4"><p className="mb-2 text-sm font-medium">当前范围：{documentIds ? `选定 ${documentIds.length} 份资料${documents.length ? ` · ${documents.map(d => d.name).join("、")}` : ""}` : workspaceId ? "本次导入的资料" : "我的全部资料"}</p><LibraryReadiness workspaceId={workspaceId} documentIds={documentIds} onDocuments={setDocuments} disabled={busy} preparing={indexing} onPrepare={() => void indexLibrary()} /></div>
      {!persistent && <p className="mt-3 text-sm text-muted-foreground">请先配置持久化存储并在 <Link href="/workspace" className="text-primary underline underline-offset-4">工作区导入资料</Link>。</p>}
      <form onSubmit={e => { e.preventDefault(); void search(); }} className="mt-6 rounded-2xl border bg-card p-4 sm:p-5">
        <label htmlFor="knowledge-query" className="sr-only">向资料提问</label>
        <textarea id="knowledge-query" value={query} disabled={busy || indexing} maxLength={1500} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void search(); } }} placeholder={mode === "ask" ? "输入与你资料有关的问题…" : "输入要查找的文字或文件名…"} rows={3} className="w-full resize-none bg-transparent text-base leading-7 outline-none placeholder:text-muted-foreground" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div className="flex gap-1" role="group" aria-label="搜索方式">{(["ask", "find"] as const).map(value => <Button key={value} type="button" disabled={busy || indexing} variant={mode === value ? "secondary" : "ghost"} size="sm" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "ask" ? "问答" : "查找资料"}</Button>)}</div><Button type="submit" disabled={!query.trim() || busy || indexing}><Search size={15} />{busy ? "搜索中" : "搜索"}</Button></div>
      </form>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{mode === "ask" ? "基于原文回答 · 可验证引用" : "查找文件与段落 · 不生成回答"} · <Link href="/settings#help" className="inline-flex min-h-11 items-center underline">为什么搜不到？</Link></span></div>
      {(preparation.error || indexMessage?.scope === preparationScope) && <p role="status" className="mt-3 text-sm text-muted-foreground">{preparation.error || indexMessage?.text}</p>}
      {!result && !busy && <div className="mt-7 space-y-5"><div><h3 className="text-xs text-muted-foreground">示例问法 · 不代表资料库已包含这些内容</h3><div className="mt-3 flex flex-wrap gap-2">{suggestions.map(s => <button key={s} type="button" onClick={() => setQuery(s)} className="min-h-11 rounded-lg border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{s}</button>)}</div></div>{recent.length > 0 && <div><h3 className="text-xs text-muted-foreground">最近搜索</h3><div className="mt-2 divide-y">{recent.map(r => <button key={r.id} type="button" onClick={() => void openHistory(r.id)} className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left text-sm">{r.query}<ArrowUpRight size={14} className="shrink-0 text-muted-foreground" /></button>)}</div></div>}</div>}
    </section>
    {error && <p role="alert" className="mx-auto max-w-3xl rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
    <div className="mx-auto max-w-3xl"><SearchRecovery issues={issues} busy={busy} preparing={indexing} canPrepare={persistent} hasSources={!!(result?.sources.length || result?.nearest.length)} onPrepare={() => void indexLibrary()} onEdit={editQuery} onSources={() => { const section = document.getElementById("search-passages"); section?.focus(); section?.scrollIntoView({ block: "start" }); }} onRetry={() => void search()} /></div>
    {busy && <section className="mx-auto max-w-3xl" aria-busy="true"><p role="status" className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />{stage}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{mode === "ask" ? "正在检查原文依据，完成后显示回答。" : "正在查找正文，完成后显示相关片段。"}</p><Button type="button" size="sm" variant="ghost" onClick={cancel}>取消搜索</Button></div></section>}
    {result && <SearchResults result={result} retainedSuccess={retainedSuccess} busy={busy} indexing={indexing} issues={issues} onSearch={(option, compareAll) => void search(option, compareAll)} onPreview={preview} />}
    <SearchCitation selected={selected} selectedRunId={selectedRunId} onClose={() => setSelected(null)} />
  </div>;
}
