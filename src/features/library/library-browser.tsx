"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, FileText, Grid2X2, List, Network, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { cn } from "@/lib/utils";
import { categoryLabel, systemMessage } from "@/lib/ui-labels";
import { formatDocumentDate } from "@/features/library/document-presentation";
import type { DocumentViewModel } from "@/types";
import { DocumentReading } from "./document-reader";
import { useRouter } from "next/navigation";
import { KnowledgeIndex } from "./knowledge-index";
import { ImageSourceView } from "@/components/knowledge/image-source-view";
import type { CitationAnchor } from "@/lib/retrieval/citation-contract";
import { returnToSearchURL } from "@/lib/retrieval/citation-contract";
import type { ReadableDocument } from "@/lib/workspace/document-reader";
import { formatFileSize } from "@/config/upload";
import { CitationReading } from "@/components/knowledge/citation-reader";

export function LibraryBrowser({ documents, categories, initialSelectedId, dataset = "example", persistent = false, citation, citationInvalid = false, runId }: { documents: DocumentViewModel[]; categories: string[]; initialSelectedId?: string; dataset?: "example" | "workspace"; persistent?: boolean; citation?: CitationAnchor; citationInvalid?: boolean; runId?: string }) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, Partial<DocumentViewModel>>>({});
  const currentDocuments = useMemo(() => documents.map(d => ({ ...d, ...overrides[d.id] })), [documents, overrides]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<DocumentViewModel | null>(documents.find((document) => document.id === initialSelectedId) ?? null);
  const [requestedId, setRequestedId] = useState(initialSelectedId && !selected && persistent ? initialSelectedId : null);
  const [directDetail, setDirectDetail] = useState<ReadableDocument | undefined>();
  const [directError, setDirectError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!requestedId) return;
    const abort = new AbortController();
    void fetch(`/api/documents/${encodeURIComponent(requestedId)}`, { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error("资料不存在或无法访问。请核对当前身份和资料链接。");
      return response.json() as Promise<ReadableDocument>;
    }).then(data => {
      if (abort.signal.aborted) return;
      setDirectDetail(data); setRequestedId(null); setDirectError("");
      setSelected({ id:data.id,name:data.name,type:data.fileType,category:data.category ?? "Uncategorized",summary:data.summary,tags:data.tags,updatedAt:data.updatedAt,size:formatFileSize(data.fileSize),relations:data.relations,storageStatus:data.storageStatus,indexStatus:data.indexStatus });
    }).catch(() => { if (!abort.signal.aborted) setDirectError("资料不存在或暂时无法访问。请核对当前身份和资料链接。"); });
    return () => abort.abort();
  }, [requestedId, retry]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return currentDocuments.filter((document) => (category === "all" || document.category === category) && (!needle || [document.name, document.summary, ...document.tags].join(" ").toLocaleLowerCase().includes(needle)));
  }, [currentDocuments, category, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1"><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="bg-card pl-10" aria-label={dataset === "workspace" ? "筛选本地资料" : "筛选示例资料"} placeholder="按名称、摘要或标签筛选…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="flex items-center gap-2 sm:ml-auto"><span className="mr-2 text-xs text-muted-foreground">{filtered.length} 份资料</span><div className="flex rounded-lg border border-border p-1"><Button size="icon" variant="ghost" className={cn("min-h-11 min-w-11 sm:size-8 sm:min-h-8 sm:min-w-8", view === "grid" && "bg-muted")} onClick={() => setView("grid")} aria-label="卡片视图" aria-pressed={view === "grid"}><Grid2X2 size={15} /></Button><Button size="icon" variant="ghost" className={cn("min-h-11 min-w-11 sm:size-8 sm:min-h-8 sm:min-w-8", view === "list" && "bg-muted")} onClick={() => setView("list")} aria-label="列表视图" aria-pressed={view === "list"}><List size={17} /></Button></div></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-5"><SlidersHorizontal size={14} className="mr-1 text-muted-foreground" />{[{ value: "all", label: "全部资料" }, ...categories.map((item) => ({ value: item, label: categoryLabel(item) }))].map((item) => <button key={item.value} onClick={() => setCategory(item.value)} aria-pressed={category === item.value} className={cn("min-h-11 rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-muted sm:min-h-8", category === item.value ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground")}>{item.label}</button>)}</div>

      {filtered.length === 0 ? <EmptyState icon={Search} title="没有找到匹配的资料" description="试试其他名称、关键词或分类。这里筛选当前视图中的资料。"><Button variant="outline" size="sm" onClick={() => { setQuery(""); setCategory("all"); }}>清除筛选</Button></EmptyState> : (
        <div className={cn(view === "grid" ? "grid gap-4 md:grid-cols-2 2xl:grid-cols-3" : "divide-y divide-border rounded-xl border border-border bg-card")}>
          {filtered.map((document) => <button key={document.id} onClick={() => setSelected(document)} className={cn("group text-left transition-colors hover:bg-muted/50", view === "grid" ? "flex flex-col rounded-xl border border-border bg-card p-5" : "flex items-center gap-4 px-5 py-4")}>
            {document.type === "image" && persistent && document.storageStatus!=="missing" && document.storageStatus!=="not_stored" && <Image src={`/api/images/${document.id}?original=1`} alt={`预览： ${document.name}`} width={400} height={240} unoptimized className={view === "grid" ? "mb-4 aspect-video w-full rounded-lg bg-muted object-contain" : "h-16 w-24 shrink-0 rounded bg-muted object-contain"} />}
            <div className={cn("flex items-center", view === "grid" ? "mb-5 justify-between" : "shrink-0")}><span className="flex size-10 items-center justify-center rounded-lg bg-muted"><FileText size={19} strokeWidth={1.6} className="text-muted-foreground" /></span>{view === "grid" && <span className="font-mono text-[10px] uppercase text-muted-foreground">{document.type}</span>}</div>
            <div className={cn("min-w-0", view === "list" && "flex-1")}><h3 className="truncate text-sm font-medium group-hover:text-primary">{document.name}</h3><p className={cn("mt-2 text-xs leading-6 text-muted-foreground", view === "grid" ? "line-clamp-2" : "line-clamp-1")}>{systemMessage(document.summary)}</p>{document.type === "image" && persistent && <p className="mt-2 text-xs text-muted-foreground">图片 · {document.indexStatus === "ready" ? "可搜索" : document.indexStatus === "failed" ? "索引失败，可重试" : "等待建立索引"}</p>}</div>
            {view === "grid" && <div className="mt-4 flex flex-wrap gap-1.5">{document.tags.slice(0, 2).map((tag) => <Badge key={tag} variant="secondary" className="font-normal">{tag}</Badge>)}</div>}
            {persistent && ["missing","not_stored"].includes(document.storageStatus??"") && <p className="mt-3 text-xs leading-6 text-muted-foreground">原文件不可用 · 已保存的提取内容仍可搜索</p>}
            <div className={cn("flex items-center text-[11px] text-muted-foreground", view === "grid" ? "mt-5 justify-between border-t border-border pt-4" : "hidden gap-5 lg:flex")}><span>{categoryLabel(document.category)}</span><span>{formatDocumentDate(document.updatedAt)}</span></div>
            {view === "list" && <ArrowUpRight size={15} className="shrink-0 text-muted-foreground" />}
          </button>)}
        </div>
      )}

      <Dialog open={selected !== null || requestedId !== null} onOpenChange={(open) => { if (!open) { setSelected(null); setRequestedId(null); setDirectError(""); } }}>
        <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", selected?.type === "image" ? "sm:max-w-2xl" : "sm:max-w-2xl")}>
          <DialogHeader><DialogTitle className="break-words pr-5 text-base leading-7">{selected?.name ?? "资料详情"}</DialogTitle><DialogDescription>{dataset === "workspace" ? persistent ? ["missing","not_stored"].includes(selected?.storageStatus??"")?"原文件不可用 · 仍可查看已保存摘要、分类和标签":"已保存资料 · 阅读原件、提取全文或修正分类标签" : "本地提取摘要 · 分类和标签使用演示规则，原文件未修改" : "示例资料详情 · 没有连接真实原文件"}</DialogDescription></DialogHeader>
          {!selected && !directError && <p role="status" className="text-sm">正在按资料 ID 加载…</p>}
          {directError && <div role="alert" className="space-y-3 text-sm"><p>{directError}</p><Button variant="outline" size="sm" onClick={() => { setDirectError(""); setRetry(value => value + 1); }}>重试加载资料</Button></div>}
          {citationInvalid && <p role="status" className="text-sm leading-7">引用定位链接不完整或无效。当前全文不会应用该定位，请返回搜索后重新打开引用。</p>}
          {selected && citation?.documentId === selected.id && <CitationReading anchor={citation} runId={runId} initiallyFull showImage={false} />}
          {runId && (!selected || !citation) && <Button asChild variant="outline" size="sm"><Link href={returnToSearchURL(runId, citation?.chunkId)}>返回原搜索结果</Link></Button>}
          {selected && dataset === "workspace" && persistent && <div className="flex flex-wrap gap-2"><Button asChild size="sm"><Link href={`/search?document=${selected.id}`}>向这份资料提问</Link></Button>{selected.storageStatus === "available" && <Button asChild variant="outline" size="sm"><a href={`/api/documents/${selected.id}/original`} target="_blank" rel="noopener noreferrer">打开或下载原文件</a></Button>}</div>}
          {selected?.type === "image" && persistent && <ImageSourceView key={selected.id} documentId={selected.id} />}
          {selected && <div className="space-y-6"><div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/60 p-4"><div><p className="text-[11px] text-muted-foreground">分类</p><p className="mt-1.5 text-xs">{categoryLabel(selected.category)}</p></div><div><p className="text-[11px] text-muted-foreground">大小</p><p className="mt-1.5 text-xs">{selected.size}</p></div><div><p className="text-[11px] text-muted-foreground">更新日期</p><p className="mt-1.5 text-xs">{formatDocumentDate(selected.updatedAt)}</p></div></div><div><h3 className="text-xs font-medium text-muted-foreground">内容摘要</h3><p className="mt-2 text-sm leading-7">{systemMessage(selected.summary)}</p></div><div className="flex flex-wrap gap-2">{selected.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div><div className="flex items-center justify-between border-t border-border pt-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Network size={15} /> {selected.relations} 条{dataset === "workspace" ? "规则" : "示例"}关联</span><Button variant="outline" size="sm" asChild><Link href={dataset === "workspace" ? "/graph?source=workspace" : "/graph"}>探索图谱 <ArrowUpRight size={14} /></Link></Button></div></div>}
          {selected && dataset === "workspace" && persistent && <><DocumentReading key={selected.id} documentId={selected.id} initialDetail={directDetail?.id === selected.id ? directDetail : undefined} onSaved={data => { const patch = { category: data.category ?? "Uncategorized", tags: data.tags, relations:data.relations }; setOverrides(old => ({ ...old, [selected.id]: patch })); setSelected({ ...selected, ...patch }); router.refresh(); }} />{selected.type !== "image" && <KnowledgeIndex documentId={selected.id} />}</>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
