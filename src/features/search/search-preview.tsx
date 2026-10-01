"use client";

import { useState } from "react";
import { ArrowUpRight, FileText, Quote, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DemoDocument } from "@/types";

export function SearchPreview({ suggestions, documents }: { suggestions: string[]; documents: DemoDocument[] }) {
  const [question, setQuestion] = useState("");

  return (
    <div className="space-y-10">
      <section className="mx-auto max-w-3xl pt-5 sm:pt-10">
        <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">你想知道什么？</h2>
        <form onSubmit={(event) => event.preventDefault()} className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <label htmlFor="ai-question" className="sr-only">向你的资料提问</label>
          <textarea id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="比如：我的资料里，RAG 和知识管理有哪些联系？" rows={3} className="w-full resize-none bg-transparent text-base leading-7 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50" />
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-4"><span className="text-xs text-muted-foreground">自然语言问题 · 语义检索待接入</span><Button size="sm" type="submit" disabled><Search size={15} /> 搜索</Button></div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">Phase 1 仅预览提问与引用结构。输入内容不会发送到服务端。</p>
        <div className="mt-6"><p className="mb-3 text-xs text-muted-foreground">从一个问题开始</p><div className="flex flex-wrap gap-2">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => setQuestion(suggestion)} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:min-h-8">{suggestion}<ArrowUpRight size={12} className="shrink-0" /></button>)}</div></div>
      </section>

      <section className="mx-auto max-w-3xl border-t border-border pt-7">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">让每个回答，有迹可循。</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">以下展示来源卡片的布局。它们来自独立示例数据，与输入问题无关。</p></div><Badge variant="outline">引用结构预览</Badge></div>
        <div className="mt-5 space-y-3">{documents.slice(0, 2).map((document, index) => <article key={document.id} className="rounded-xl border border-border bg-card p-5"><div className="flex items-center gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-xs text-primary">{index + 1}</span><FileText size={16} className="shrink-0 text-muted-foreground" /><h3 className="truncate text-sm font-medium">{document.name}</h3><Badge variant="secondary" className="ml-auto hidden shrink-0 sm:inline-flex">{document.category}</Badge></div><div className="mt-4 flex gap-3"><Quote size={16} className="mt-1 shrink-0 text-muted-foreground" /><p className="text-sm leading-7 text-muted-foreground">{document.summary}</p></div><p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">摘要示例 · 原文位置与真实引用将在 RAG 阶段接入</p></article>)}</div>
      </section>
    </div>
  );
}
