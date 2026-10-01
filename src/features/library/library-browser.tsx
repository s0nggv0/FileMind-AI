"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileText, Grid2X2, List, Network, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { cn } from "@/lib/utils";
import { formatDocumentDate } from "@/features/library/document-presentation";
import type { DemoDocument } from "@/types";

export function LibraryBrowser({ documents, categories, initialSelectedId }: { documents: DemoDocument[]; categories: string[]; initialSelectedId?: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<DemoDocument | null>(documents.find((document) => document.id === initialSelectedId) ?? null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return documents.filter((document) => (category === "all" || document.category === category) && (!needle || [document.name, document.summary, ...document.tags].join(" ").toLocaleLowerCase().includes(needle)));
  }, [documents, category, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1"><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="bg-card pl-10" aria-label="筛选示例资料" placeholder="按名称、摘要或标签筛选…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="flex items-center gap-2 sm:ml-auto"><span className="mr-2 text-xs text-muted-foreground">{filtered.length} 份资料</span><div className="flex rounded-lg border border-border p-1"><Button size="icon" variant="ghost" className={cn("min-h-11 min-w-11 sm:size-8 sm:min-h-8 sm:min-w-8", view === "grid" && "bg-muted")} onClick={() => setView("grid")} aria-label="卡片视图" aria-pressed={view === "grid"}><Grid2X2 size={15} /></Button><Button size="icon" variant="ghost" className={cn("min-h-11 min-w-11 sm:size-8 sm:min-h-8 sm:min-w-8", view === "list" && "bg-muted")} onClick={() => setView("list")} aria-label="列表视图" aria-pressed={view === "list"}><List size={17} /></Button></div></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-5"><SlidersHorizontal size={14} className="mr-1 text-muted-foreground" />{[{ value: "all", label: "全部资料" }, ...categories.map((item) => ({ value: item, label: item }))].map((item) => <button key={item.value} onClick={() => setCategory(item.value)} aria-pressed={category === item.value} className={cn("min-h-11 rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-muted sm:min-h-8", category === item.value ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground")}>{item.label}</button>)}</div>

      {filtered.length === 0 ? <EmptyState icon={Search} title="没有找到匹配的资料" description="试试其他名称、关键词或分类。这里筛选的是本地示例资料。"><Button variant="outline" size="sm" onClick={() => { setQuery(""); setCategory("all"); }}>清除筛选</Button></EmptyState> : (
        <div className={cn(view === "grid" ? "grid gap-4 md:grid-cols-2 2xl:grid-cols-3" : "divide-y divide-border rounded-xl border border-border bg-card")}>
          {filtered.map((document) => <button key={document.id} onClick={() => setSelected(document)} className={cn("group text-left transition-colors hover:bg-muted/50", view === "grid" ? "flex flex-col rounded-xl border border-border bg-card p-5" : "flex items-center gap-4 px-5 py-4")}>
            <div className={cn("flex items-center", view === "grid" ? "mb-5 justify-between" : "shrink-0")}><span className="flex size-10 items-center justify-center rounded-lg bg-muted"><FileText size={19} strokeWidth={1.6} className="text-muted-foreground" /></span>{view === "grid" && <span className="font-mono text-[10px] uppercase text-muted-foreground">{document.type}</span>}</div>
            <div className={cn("min-w-0", view === "list" && "flex-1")}><h3 className="truncate text-sm font-medium group-hover:text-primary">{document.name}</h3><p className={cn("mt-2 text-xs leading-6 text-muted-foreground", view === "grid" ? "line-clamp-2" : "line-clamp-1")}>{document.summary}</p></div>
            {view === "grid" && <div className="mt-4 flex flex-wrap gap-1.5">{document.tags.slice(0, 2).map((tag) => <Badge key={tag} variant="secondary" className="font-normal">{tag}</Badge>)}</div>}
            <div className={cn("flex items-center text-[11px] text-muted-foreground", view === "grid" ? "mt-5 justify-between border-t border-border pt-4" : "hidden gap-5 lg:flex")}><span>{document.category}</span><span>{formatDocumentDate(document.updatedAt)}</span></div>
            {view === "list" && <ArrowUpRight size={15} className="shrink-0 text-muted-foreground" />}
          </button>)}
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="pr-5 text-base leading-7">{selected?.name}</DialogTitle><DialogDescription>示例资料详情 · 没有连接真实原文件</DialogDescription></DialogHeader>
          {selected && <div className="space-y-6"><div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/60 p-4"><div><p className="text-[11px] text-muted-foreground">分类</p><p className="mt-1.5 text-xs">{selected.category}</p></div><div><p className="text-[11px] text-muted-foreground">大小</p><p className="mt-1.5 text-xs">{selected.size}</p></div><div><p className="text-[11px] text-muted-foreground">更新日期</p><p className="mt-1.5 text-xs">{formatDocumentDate(selected.updatedAt)}</p></div></div><div><h3 className="text-xs font-medium text-muted-foreground">内容摘要</h3><p className="mt-2 text-sm leading-7">{selected.summary}</p></div><div className="flex flex-wrap gap-2">{selected.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div><div className="flex items-center justify-between border-t border-border pt-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Network size={15} /> {selected.relations} 条示例关联</span><Button variant="outline" size="sm" asChild><Link href="/graph">探索图谱 <ArrowUpRight size={14} /></Link></Button></div></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
