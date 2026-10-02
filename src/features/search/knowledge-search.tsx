"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileText, Loader2, Search, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { SearchResult } from "@/lib/retrieval/search-contract";
import type { RAGSource } from "@/lib/retrieval/rag";
import type { Evidence } from "@/lib/retrieval/types";
const suggestions = ["我哪些资料讲过 Transformer 的 Query、Key、Value？", "找出与数据库索引优化相关的资料", "Where did I learn about attention mechanisms?"];
export function KnowledgeSearch({ persistent, mock }: { persistent: boolean; mock: boolean }) {
  const [query, setQuery] = useState(""); const [mode, setMode] = useState<"ask" | "find">("ask");
  const [result, setResult] = useState<SearchResult | null>(null); const [stage, setStage] = useState("");
  const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [recent, setRecent] = useState<{ id: string; query: string; mode: "ask" | "find" }[]>([]);
  const [selected, setSelected] = useState<RAGSource | null>(null); const [source, setSource] = useState<Evidence | null>(null); const [sourceError, setSourceError] = useState("");
  const [indexing, setIndexing] = useState(false); const [indexMessage, setIndexMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sourceController = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/search", { signal: abort.signal }).then(r => r.json()).then(data => setRecent(data.recent ?? [])).catch(() => {});
    const runId = new URLSearchParams(window.location.search).get("run");
    if (runId) void fetch(`/api/search?runId=${encodeURIComponent(runId)}`, { signal: abort.signal }).then(async r => { if (!r.ok) throw new Error("This saved search is no longer available."); return r.json(); }).then((data: SearchResult) => { setResult(data); setQuery(data.query); setMode(data.mode); }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => { abort.abort(); controller.current?.abort(); sourceController.current?.abort(); };
  }, []);
  async function indexLibrary() {
    setIndexing(true); setIndexMessage("");
    try {
      const response = await fetch("/api/index", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const failed = data.results.filter((r: { status: string }) => r.status === "failed").length;
      setIndexMessage(failed ? `${failed} 个文件的语义索引未完成。已提取的段落仍可用于关键词检索，可稍后重试。` : `${data.results.length} 个文件的知识索引已就绪。`);
    } catch (e) { setIndexMessage(e instanceof Error ? e.message : "Indexing is unavailable."); }
    finally { setIndexing(false); }
  }
  async function search() {
    if (!query.trim() || busy) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setDraft(""); setStage("Searching your knowledge");
    const previousRunId = result?.id; setResult(null);
    try {
      const response = await fetch("/api/search", { method: "POST", signal: abort.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ query, mode, ...(previousRunId ? { previousRunId } : {}) }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error); }
      const reader = response.body?.getReader(); if (!reader) throw new Error("Search stream unavailable.");
      const decoder = new TextDecoder(); let buffer = ""; let completed = false;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const events = buffer.split("\n\n"); buffer = events.pop() ?? "";
        for (const event of events) {
          const line = event.split("\n").find(l => l.startsWith("data: ")); if (!line) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "stage") setStage(payload.data);
          if (payload.type === "draft") setDraft(payload.data);
          if (payload.type === "error") throw new Error(payload.data);
          if (payload.type === "result") {
            const data = payload.data as SearchResult; setResult(data); setDraft(""); completed = true;
            window.history.replaceState(null, "", `/search?run=${data.id}`);
            setRecent(old => [{ id: data.id, query: data.query, mode: data.mode }, ...old.filter(r => r.id !== data.id)].slice(0, 10));
          }
        }
      }
      if (!completed) throw new Error("Search was interrupted. Please retry.");
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Search unavailable."); setDraft(""); }
    finally { setBusy(false); setStage(""); }
  }
  async function preview(item: RAGSource) {
    sourceController.current?.abort(); const abort = new AbortController(); sourceController.current = abort;
    setSelected(item); setSource(null); setSourceError("");
    try { const response = await fetch(`/api/search?chunkId=${item.id}`, { signal: abort.signal }); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!abort.signal.aborted) setSource(data); }
    catch (e) { if (!abort.signal.aborted) setSourceError(e instanceof Error ? e.message : "Source unavailable."); }
  }
  const shownSources = result?.sources.length ? result.sources : result?.nearest ?? [];
  const nearestOnly = result && !result.sources.length;
  return <div className="mx-auto max-w-5xl space-y-9">
    <section className="mx-auto max-w-3xl pt-5 sm:pt-9">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Ask your knowledge</h2>{(mock || result?.mock) && <Badge variant="outline">Demo / Mock</Badge>}</div>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">从你的资料中找答案，点击引用核对原文。</p>
      {!persistent && <p className="mt-3 text-sm text-muted-foreground">请先配置持久化存储并在 <Link href="/workspace" className="text-primary underline underline-offset-4">Workspace 导入资料</Link>。</p>}
      <form onSubmit={e => { e.preventDefault(); void search(); }} className="mt-6 rounded-2xl border bg-card p-4 sm:p-5">
        <label htmlFor="knowledge-query" className="sr-only">Ask your knowledge</label>
        <textarea id="knowledge-query" value={query} maxLength={1500} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void search(); } }} placeholder="我之前哪些资料讲过 Transformer 的 Query、Key、Value？" rows={3} className="w-full resize-none bg-transparent text-base leading-7 outline-none placeholder:text-muted-foreground" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div className="flex gap-1" role="group" aria-label="Search mode">{(["ask", "find"] as const).map(value => <Button key={value} type="button" variant={mode === value ? "secondary" : "ghost"} size="sm" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "ask" ? "Ask" : "Find"}</Button>)}</div><Button type="submit" disabled={!query.trim() || busy || indexing}><Search size={15} />{busy ? "搜索中" : "搜索"}</Button></div>
      </form>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{mode === "ask" ? "基于原文回答 · 可验证引用" : "查找文件与段落 · 不生成回答"}</span>{persistent && <Button size="sm" variant="ghost" disabled={indexing || busy} onClick={() => void indexLibrary()}>{indexing ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />} {indexing ? "Indexing..." : "更新知识索引"}</Button>}</div>
      {indexMessage && <p role="status" className="mt-3 text-sm text-muted-foreground">{indexMessage}</p>}
      {!result && !busy && <div className="mt-7 space-y-5"><div><h3 className="text-xs text-muted-foreground">Suggested queries</h3><div className="mt-3 flex flex-wrap gap-2">{suggestions.map(s => <button key={s} type="button" onClick={() => setQuery(s)} className="min-h-11 rounded-lg border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{s}</button>)}</div></div>{recent.length > 0 && <div><h3 className="text-xs text-muted-foreground">Recent searches</h3><div className="mt-2 divide-y">{recent.map(r => <button key={r.id} type="button" onClick={() => { setQuery(r.query); setMode(r.mode); }} className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left text-sm">{r.query}<ArrowUpRight size={14} className="shrink-0 text-muted-foreground" /></button>)}</div></div>}</div>}
    </section>
    {error && <p role="alert" className="mx-auto max-w-3xl rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
    {busy && <section className="mx-auto max-w-3xl" aria-busy="true"><p role="status" className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />{stage}</p>{draft && <><p className="mt-5 whitespace-pre-wrap text-base leading-8">{draft}</p><p className="mt-2 text-xs text-muted-foreground">生成中 · 完成后校验引用</p></>}</section>}
    {result && <section className="grid min-w-0 gap-8 border-t pt-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {result.semanticUnavailable && <p role="status" className="text-sm text-muted-foreground">Semantic search temporarily unavailable. 当前展示关键词检索结果。</p>}
        {result.mode === "ask" && <article><h3 className="text-sm font-semibold">AI Answer</h3>{result.answer ? <p className="mt-4 whitespace-pre-wrap text-base leading-8">{result.answer.answer.split(/(\[S\d+\])/g).map((part, i) => {
          const match = /^\[S(\d+)\]$/.exec(part); if (!match) return <span key={i}>{part}</span>;
          const item = result.sources.find(s => s.sourceId === `S${match[1]}`); if (!item) return null;
          return <button key={i} type="button" aria-label={`Citation ${match[1]}`} title={`${item.documentName} · ${item.location}\n${item.content.slice(0, 240)}`} onClick={() => void preview(item)} className="mx-1 inline-flex min-h-9 min-w-9 items-center justify-center rounded-md bg-primary/10 px-1.5 text-sm font-medium text-primary">[{match[1]}]</button>;
        })}</p> : <p className="mt-4 text-sm leading-7 text-muted-foreground">I found these relevant passages, but AI answer generation is currently unavailable.</p>}</article>}
        <article><h3 className="text-sm font-semibold">{nearestOnly ? "Closest passages" : "Relevant Documents"}</h3>{nearestOnly && <p className="mt-2 text-xs leading-6 text-muted-foreground">这些是最接近的段落，尚不足以作为回答依据。</p>}<div className="mt-3 divide-y">{shownSources.map((s, i) => <button key={s.id} type="button" onClick={() => void preview(s)} className="flex w-full gap-3 py-5 text-left"><FileText size={18} className="mt-1 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{s.documentName}</span><span className="mt-1 block text-xs text-muted-foreground">{s.location} · Rank #{i + 1}</span><span className="mt-3 line-clamp-3 block whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{s.content}</span></span></button>)}</div>{!shownSources.length && <p className="mt-4 text-sm leading-7 text-muted-foreground">没有匹配段落。导入相关资料或更新知识索引后再试。</p>}</article>
        <p className="text-xs text-muted-foreground">{result.candidateCount} 个候选段落 · {result.evidenceCount} 个证据段落</p>
        {result.debug && <details className="rounded-lg border p-4"><summary className="cursor-pointer text-xs text-muted-foreground">Retrieval Debug Panel</summary><pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">{JSON.stringify({ query: result.rewrittenQuery, ...result.debug, evidence: result.sources.map(s => ({ id: s.id, location: s.location })) }, null, 2)}</pre></details>}
      </div>
      <aside className="min-w-0 border-t pt-6 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0"><h3 className="text-sm font-semibold">{nearestOnly ? "Nearest sources" : "Sources"}</h3><div className="mt-3 divide-y">{shownSources.map((s, i) => <button key={s.id} type="button" title={s.content.slice(0, 240)} onClick={() => void preview(s)} className="flex w-full gap-3 py-4 text-left"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs text-primary">{i + 1}</span><span className="min-w-0"><span className="block break-words text-sm font-medium">{s.documentName}</span><span className="mt-2 block text-xs text-muted-foreground">{s.location}</span></span></button>)}</div></aside>
    </section>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) { setSelected(null); setSource(null); } }}><DialogContent className="top-0 right-0 left-auto h-dvh w-full max-w-xl translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:max-w-xl"><DialogHeader><DialogTitle className="break-words pr-5 text-base leading-7">{selected?.documentName}</DialogTitle><DialogDescription>Document Source · {selected?.location}</DialogDescription></DialogHeader>{sourceError && <p role="alert" className="text-sm text-destructive">{sourceError}</p>}{!source && !sourceError && <p role="status" className="text-sm text-muted-foreground">Loading original source...</p>}{source && <div className="space-y-6"><div><h3 className="text-xs font-medium text-muted-foreground">数据库原文</h3><mark className="mt-3 block whitespace-pre-wrap break-words rounded-lg bg-accent p-4 text-sm leading-8 text-foreground">{source.content}</mark></div><div><h3 className="text-xs font-medium text-muted-foreground">AI 摘要</h3><p className="mt-2 text-sm leading-7">{source.summary || "尚无文档摘要。"}</p></div><div className="flex flex-wrap gap-2">{source.tags.map(t => <Badge variant="secondary" key={t}>{t}</Badge>)}</div><div className="flex flex-wrap gap-3 border-t pt-5"><Button asChild variant="outline" size="sm"><Link href={`/library?source=workspace&document=${source.documentId}`}>Open document <ArrowUpRight size={14} /></Link></Button><Button asChild variant="ghost" size="sm"><Link href="/graph?source=workspace">View related knowledge</Link></Button></div></div>}</DialogContent></Dialog>
  </div>;
}
