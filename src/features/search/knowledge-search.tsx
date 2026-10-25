"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileText, Loader2, Search, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageSourceView } from "@/components/knowledge/image-source-view";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LibraryReadiness } from "@/components/knowledge/library-readiness";
import type { ReadinessDocument } from "@/lib/retrieval/readiness";
import { useSearchPreparation } from "@/lib/retrieval/use-search-preparation";
import { stateLabel, systemMessage } from "@/lib/ui-labels";
import type { SearchResult } from "@/lib/retrieval/search-contract";
import type { RAGSource } from "@/lib/retrieval/rag";
import type { Evidence } from "@/lib/retrieval/types";
const suggestions = ["我哪些资料讲过 Transformer 的 Query、Key、Value？", "找出与数据库索引优化相关的资料", "哪些资料讲过注意力机制？"];
export function KnowledgeSearch({ persistent, mock, initialWorkspace, initialDocument, initialDocuments, initialQuery = "", initialMode = "ask" }: { persistent: boolean; mock: boolean; initialWorkspace?: string; initialDocument?: string; initialDocuments?: string[]; initialQuery?: string; initialMode?: "ask" | "find" }) {
  const [documents, setDocuments] = useState<ReadinessDocument[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(initialWorkspace);
  const [documentIds, setDocumentIds] = useState<string[] | undefined>(initialDocument ? [initialDocument] : initialDocuments);
  const [query, setQuery] = useState(initialQuery); const [mode, setMode] = useState<"ask" | "find">(initialMode);
  const [result, setResult] = useState<SearchResult | null>(null); const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [recent, setRecent] = useState<{ id: string; query: string; mode: "ask" | "find" }[]>([]);
  const [selected, setSelected] = useState<RAGSource | null>(null); const [source, setSource] = useState<Evidence | null>(null); const [sourceError, setSourceError] = useState("");
  const preparation = useSearchPreparation({ workspaceId, documentIds });
  const indexing = preparation.busy;
  const [indexMessage, setIndexMessage] = useState<{ scope: string; text: string } | null>(null);
  const preparationScope = JSON.stringify([workspaceId, documentIds]);
  const controller = useRef<AbortController | null>(null);
  const sourceController = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/search", { signal: abort.signal }).then(r => r.json()).then(data => setRecent(data.recent ?? [])).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const runId = params.get("run");
    if (runId) void fetch(`/api/search?runId=${encodeURIComponent(runId)}`, { signal: abort.signal }).then(async r => { if (!r.ok) throw new Error("这条搜索记录已不可用，请重新搜索。"); return r.json(); }).then((data: SearchResult) => { setResult(data); setQuery(data.query); setMode(data.mode); setWorkspaceId(data.workspaceId); setDocumentIds(data.selectedDocumentIds); }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => { abort.abort(); controller.current?.abort(); sourceController.current?.abort(); };
  }, []);
  async function indexLibrary() {
    setIndexMessage(null);
    const outcome = await preparation.run();
    if (!outcome) return;
    const { results, processing, summary } = outcome;
    const failed = summary.retryable;
    setIndexMessage({ scope: preparationScope, text: failed ? `${failed} 份资料尚未准备完成，已有结果保留。请核对上方可搜索数量后重试。` : results.length ? `本次已准备 ${results.length} 份资料，其余已就绪或正在处理的资料未重复处理。` : processing ? `${processing} 份资料正在准备，请稍后查看搜索准备状态。` : "当前范围内暂无需要准备的资料。" });
  }

  async function openHistory(id: string) {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setError(""); setBusy(true);
    try {
      const response = await fetch(`/api/search?runId=${encodeURIComponent(id)}`, { signal: abort.signal });
      if (!response.ok) throw new Error("这条搜索记录已不可用，请重新搜索。");
      const data: SearchResult = await response.json(); if (abort.signal.aborted) return;
      setResult(data); setQuery(data.query); setMode(data.mode); setWorkspaceId(data.workspaceId); setDocumentIds(data.selectedDocumentIds); window.history.replaceState(null, "", `/search?run=${data.id}`);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "历史记录暂时无法打开。"); } finally { setBusy(false); }
  }
  async function search(clarificationOption?: number, compareAll = false) {
    if (!query.trim() || busy) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setStage("正在搜索资料");
    const previousRunId = result?.id; setResult(null);
    try {
      const response = await fetch("/api/search", { method: "POST", signal: abort.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ query, mode, ...(workspaceId ? { workspaceId } : {}), ...(documentIds ? { documentIds } : {}), ...(previousRunId ? { previousRunId } : {}), ...(clarificationOption !== undefined ? { clarificationOption } : {}), ...(compareAll ? { compareAll: true } : {}) }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error); }
      const reader = response.body?.getReader(); if (!reader) throw new Error("搜索连接不可用，请重试。");
      const decoder = new TextDecoder(); let buffer = ""; let completed = false;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        abort.signal.throwIfAborted();
        buffer += decoder.decode(value, { stream: true }); const events = buffer.split("\n\n"); buffer = events.pop() ?? "";
        for (const event of events) {
          const line = event.split("\n").find(l => l.startsWith("data: ")); if (!line) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "stage") setStage(systemMessage(payload.data));
          if (payload.type === "error") throw new Error(payload.data);
          if (payload.type === "result") {
            abort.signal.throwIfAborted(); const data = payload.data as SearchResult; setResult(data); setDocumentIds(data.selectedDocumentIds); completed = true;
            window.history.replaceState(null, "", `/search?run=${data.id}`);
            setRecent(old => [{ id: data.id, query: data.query, mode: data.mode }, ...old.filter(r => r.id !== data.id)].slice(0, 10));
          }
        }
      }
      if (!completed) throw new Error("搜索已中断，请重试。");
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "搜索暂时不可用，请稍后重试。"); }
    finally { setBusy(false); setStage(""); }
  }
  async function preview(item: RAGSource) {
    sourceController.current?.abort(); const abort = new AbortController(); sourceController.current = abort;
    setSelected(item); setSource(null); setSourceError("");
    try { const response = await fetch(`/api/search?chunkId=${item.id}`, { signal: abort.signal }); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!abort.signal.aborted) setSource(data); }
    catch (e) { if (!abort.signal.aborted) setSourceError(e instanceof Error ? e.message : "来源暂时不可用，请重新打开。"); }
  }
  const shownSources = result?.sources.length ? result.sources : result?.nearest ?? [];
  const nearestOnly = result && !result.sources.length;
  return <div className="mx-auto max-w-5xl space-y-9">
    <section className="mx-auto max-w-3xl pt-1 sm:pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{mode === "ask" ? "向资料提问" : "查找资料正文"}</h1>{(mock || result?.mock) && <Badge variant="outline">演示 / 模拟结果</Badge>}</div>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{mode === "ask" ? "从你的资料中找答案，点击引用核对原文。" : "查找资料正文与片段，点击查看原文。"}</p><div className="mt-4"><p className="mb-2 text-sm font-medium">当前范围：{documentIds ? `选定 ${documentIds.length} 份资料${documents.length ? ` · ${documents.map(d => d.name).join("、")}` : ""}` : workspaceId ? "本次导入的资料" : "我的全部资料"}</p><LibraryReadiness workspaceId={workspaceId} documentIds={documentIds} onDocuments={setDocuments} /></div>
      {!persistent && <p className="mt-3 text-sm text-muted-foreground">请先配置持久化存储并在 <Link href="/workspace" className="text-primary underline underline-offset-4">工作区导入资料</Link>。</p>}
      <form onSubmit={e => { e.preventDefault(); void search(); }} className="mt-6 rounded-2xl border bg-card p-4 sm:p-5">
        <label htmlFor="knowledge-query" className="sr-only">向资料提问</label>
        <textarea id="knowledge-query" value={query} maxLength={1500} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void search(); } }} placeholder={mode === "ask" ? "输入与你资料有关的问题…" : "输入要查找的文字或文件名…"} rows={3} className="w-full resize-none bg-transparent text-base leading-7 outline-none placeholder:text-muted-foreground" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div className="flex gap-1" role="group" aria-label="搜索方式">{(["ask", "find"] as const).map(value => <Button key={value} type="button" variant={mode === value ? "secondary" : "ghost"} size="sm" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "ask" ? "问答" : "查找资料"}</Button>)}</div><Button type="submit" disabled={!query.trim() || busy || indexing}><Search size={15} />{busy ? "搜索中" : "搜索"}</Button></div>
      </form>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{mode === "ask" ? "基于原文回答 · 可验证引用" : "查找文件与段落 · 不生成回答"} · <Link href="/settings#help" className="inline-flex min-h-11 items-center underline">为什么搜不到？</Link></span>{persistent && <Button size="sm" variant="ghost" disabled={indexing || busy} onClick={() => void indexLibrary()}>{indexing ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />} {indexing ? "正在准备搜索…" : "准备搜索"}</Button>}</div>
      {(preparation.error || indexMessage?.scope === preparationScope) && <p role="status" className="mt-3 text-sm text-muted-foreground">{preparation.error || indexMessage?.text}</p>}
      {!result && !busy && <div className="mt-7 space-y-5"><div><h3 className="text-xs text-muted-foreground">示例问法 · 不代表资料库已包含这些内容</h3><div className="mt-3 flex flex-wrap gap-2">{suggestions.map(s => <button key={s} type="button" onClick={() => setQuery(s)} className="min-h-11 rounded-lg border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{s}</button>)}</div></div>{recent.length > 0 && <div><h3 className="text-xs text-muted-foreground">最近搜索</h3><div className="mt-2 divide-y">{recent.map(r => <button key={r.id} type="button" onClick={() => void openHistory(r.id)} className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left text-sm">{r.query}<ArrowUpRight size={14} className="shrink-0 text-muted-foreground" /></button>)}</div></div>}</div>}
    </section>
    {error && <p role="alert" className="mx-auto max-w-3xl rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
    {busy && <section className="mx-auto max-w-3xl" aria-busy="true"><p role="status" className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />{stage}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{mode === "ask" ? "正在检查原文依据，完成后显示回答。" : "正在查找正文，完成后显示相关片段。"}</p><Button type="button" size="sm" variant="ghost" onClick={()=>{controller.current?.abort();setError("搜索已取消，可以重试。");}}>取消搜索</Button></div></section>}
    {result && <section className="grid min-w-0 gap-8 border-t pt-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {result.historyWarning && <p role="status" className="rounded-lg border p-4 text-sm leading-7">{result.historyWarning}</p>}
        {result.coverage && <div role="status" className="space-y-2 rounded-lg border p-4 text-sm leading-7">
          <p>比较范围 {result.coverage.selectedCount} 份 · 参与证据 {result.coverage.evidenceDocumentIds.length} 份 · 合并副本 {result.coverage.mergedCopies.length} 份{result.mode === "ask" && ` · 回答引用 ${result.coverage.citedDocumentIds.length} 份`}</p>
          <p className="text-muted-foreground">{result.coverage.complete ? "当前范围的来源均已参与；证据覆盖不代表每份资料包含全部请求事实。" : "本次仅覆盖部分来源，不能视为完整比较。候选、证据和上下文预算保持有界；可缩小范围分批比较。"}</p>
          {result.coverage.uncovered.map(item => <p key={item.documentId} className="break-words text-muted-foreground">{item.name}：{({not_ready:"索引尚未就绪",no_relevant_evidence:"未召回足够相关证据（可能受候选预算限制）",budget:"未进入本次证据或上下文预算",not_cited:"尚无通过验证的回答引用支持所请求事实",missing_facts:"参与证据，但缺少请求事实"})[item.reason]}{item.detail && ` · ${item.detail}`}</p>)}
          {result.coverage.unlistedCount > 0 && <p>另有 {result.coverage.unlistedCount} 份超出本次来源统计预算。</p>}
        </div>}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void search()}>{result.mode === "ask" ? "重新搜索并生成回答" : "重新搜索"}</Button>
        {result.semanticUnavailable && <p role="status" className="text-sm text-muted-foreground">语义搜索暂时不可用，当前展示关键词检索结果。</p>}
        {result.answer?.conflict?.detected && <section role="status" className="space-y-3 rounded-lg border p-4"><h3 className="text-sm font-semibold">发现来源冲突</h3><p className="text-sm leading-7 text-muted-foreground">资料包含不同的值。FileMind 保留双方来源，缺少额外依据时不替你判断哪一方正确。</p>{result.answer.conflict.claims.map((claim, i) => <div key={i} className="space-y-2"><p className="break-words text-sm font-medium">{claim.topic}</p>{claim.sourceIds.map((id, j) => { const item = result.sources.find(s => s.sourceId === id); return item ? <button key={`${id}-${j}`} type="button" onClick={() => void preview(item)} className="block min-h-11 w-full break-words text-left text-sm text-primary underline underline-offset-4">{item.documentName}: {claim.values[j]}</button> : null; })}</div>)}</section>}
        {result.answerState === "needs_clarification" && result.answer?.clarification?.required && <section role="status" className="space-y-4"><h3 className="text-sm font-semibold">请选择你要询问的对象</h3><p className="text-base leading-8">{result.answer.clarification.question}</p><div className="flex flex-wrap gap-3">{result.answer.clarification.options?.map((option, i) => <Button key={i} type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal text-left" disabled={busy} onClick={() => void search(i)}>{option.label}</Button>)}<Button type="button" variant="outline" disabled={busy} onClick={() => void search(undefined, true)}>比较全部</Button></div></section>}
        {result.mode === "ask" && result.answerState !== "needs_clarification" && <article><h3 className="text-sm font-semibold">AI 回答</h3>{result.answer && (result.answer.insufficientEvidence || ["verified","conflict"].includes(result.verification?.status??"")) ? <p className="mt-4 whitespace-pre-wrap text-base leading-8">{result.answer.answer.split(/(\[S\d+\])/g).map((part, i) => {
          const match = /^\[S(\d+)\]$/.exec(part); if (!match) return <span key={i}>{part}</span>;
          const item = result.sources.find(s => s.sourceId === `S${match[1]}`); if (!item) return null;
          return <button key={i} type="button" aria-label={`引用 ${match[1]}`} title={`${item.documentName} · ${item.location}\n${item.content.slice(0, 240)}`} onClick={() => void preview(item)} className="mx-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary/10 px-1.5 text-sm font-medium text-primary">[{match[1]}]</button>;
        })}</p> : <div className="mt-4 space-y-3"><p className="text-sm leading-7 text-muted-foreground">{result.answer&&!result.verification?"这条历史回答尚未经过事实依据验证。来源仍可查看，可重新提问。":"云端 AI 服务暂时不可用。找到相关段落，但 AI 回答的生成或依据验证暂时不可用。来源仍可查看。"}</p><Button variant="outline" size="sm" onClick={()=>void search()}>重试回答</Button></div>}</article>}
        <article><h3 className="text-sm font-semibold">{nearestOnly ? "最接近的段落" : "相关资料"}</h3>{nearestOnly && <p className="mt-2 text-xs leading-6 text-muted-foreground">这些是最接近的段落，尚不足以作为回答依据。</p>}<div className="mt-3 divide-y">{shownSources.map((s, i) => <button key={s.id} type="button" onClick={() => void preview(s)} className="flex w-full gap-3 py-5 text-left"><FileText size={18} className="mt-1 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{s.documentName}</span><span className="mt-1 block text-xs text-muted-foreground">{s.fileType === "image" ? "图片" : s.fileType.toUpperCase()} · {s.location} · 排序 #{i + 1}</span><span className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{s.content}</span></span></button>)}</div>{!shownSources.length && <p className="mt-4 text-sm leading-7 text-muted-foreground">没有匹配段落。导入相关资料或准备搜索后再试。</p>}</article>
        <p className="text-xs text-muted-foreground">{result.candidateCount} 个候选段落 · {result.evidenceCount} 个证据段落{result.answer && !result.answer.insufficientEvidence && ` · 依据支持程度： ${stateLabel(result.answer.confidence)}（依据支持程度，不是准确率）`}</p>
        {result.debug && <details className="rounded-lg border p-4"><summary className="cursor-pointer text-xs text-muted-foreground">检索调试信息</summary><pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">{JSON.stringify({ query: result.rewrittenQuery, ...result.debug, evidence: result.sources.map(s => ({ id: s.id, location: s.location })) }, null, 2)}</pre></details>}
      </div>
      <aside className="min-w-0 border-t pt-6 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0"><h3 className="text-sm font-semibold">{nearestOnly ? "最接近的来源" : "来源"}</h3><div className="mt-3 divide-y">{shownSources.map((s, i) => <button key={s.id} type="button" title={s.content.slice(0, 240)} onClick={() => void preview(s)} className="flex w-full gap-3 py-4 text-left"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs text-primary">{i + 1}</span><span className="min-w-0"><span className="block break-words text-sm font-medium">{s.documentName}</span><span className="mt-2 block text-xs text-muted-foreground">{s.location}</span></span></button>)}</div></aside>
    </section>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) { setSelected(null); setSource(null); } }}><DialogContent className="top-0 right-0 left-auto h-dvh w-full max-w-xl translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:max-w-xl"><DialogHeader><DialogTitle className="break-words pr-5 text-base leading-7">{selected?.documentName}</DialogTitle><DialogDescription>资料来源 ·  {selected?.location}</DialogDescription></DialogHeader>{sourceError && <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{sourceError}</p><Button variant="outline" size="sm" onClick={() => { if (selected) void preview(selected); }}>重试加载来源</Button></div>}{!source && !sourceError && <p role="status" className="text-sm text-muted-foreground">正在加载原始来源…</p>}{source?.fileType === "image" && <ImageSourceView key={source.documentId} documentId={source.documentId} evidence={source} />}{source && source.fileType !== "image" && <div className="space-y-6"><div><h3 className="text-xs font-medium text-muted-foreground">提取原文</h3><mark className="mt-3 block whitespace-pre-wrap break-words rounded-lg bg-accent p-4 text-sm leading-8 text-foreground">{source.content}</mark></div><div><h3 className="text-xs font-medium text-muted-foreground">AI 摘要</h3><p className="mt-2 text-sm leading-7">{source.summary || "尚无文档摘要。"}</p></div><div className="flex flex-wrap gap-2">{source.tags.map(t => <Badge variant="secondary" key={t}>{t}</Badge>)}</div><div className="flex flex-wrap gap-3 border-t pt-5">{["missing","not_stored"].includes(source.storageStatus??"") ? <p role="status" className="text-sm leading-7 text-muted-foreground">原文件不可用 · 仍可核对提取正文</p> : <Button asChild variant="outline" size="sm"><a href={`/api/documents/${source.documentId}/original`} target="_blank" rel="noopener noreferrer">打开原文件 <ArrowUpRight size={14} /></a></Button>}<Button asChild variant="outline" size="sm"><Link href={`/library?source=workspace&document=${source.documentId}`}>打开资料 <ArrowUpRight size={14} /></Link></Button><Button asChild variant="ghost" size="sm"><Link href="/graph?source=workspace">查看相关知识</Link></Button></div></div>}</DialogContent></Dialog>
  </div>;
}
