"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MultimodalAnalysis } from "@/lib/multimodal/schemas";
import type { Evidence } from "@/lib/retrieval/types";
interface ImageDetail { filename: string; width: number | null; height: number | null; storageStatus?:string; analysis: MultimodalAnalysis | null; related: { id: string; name: string; type: string }[] }
export function ImageSourceView({ documentId, evidence }: { documentId: string; evidence?: Evidence }) {
  const [detail, setDetail] = useState<ImageDetail | null>(null); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/images/${documentId}`, { signal: abort.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; }).then(setDetail).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "图片来源不可用，请重新打开。"); });
    return () => abort.abort();
  }, [documentId, retry]);
  const analysis = detail?.analysis;
  return <div className="space-y-6">
    {error ? <div role="alert" className="space-y-3 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={() => { setError(""); setRetry(v => v + 1); }}>重试加载图片</Button></div> : ["missing","not_stored"].includes(detail?.storageStatus??"") ? <p role="status" className="text-sm leading-7 text-muted-foreground">原文件不可用 · 仍可查看已保存的 OCR 和 AI 分析。</p> : detail && <figure className="space-y-2"><div className="overflow-hidden rounded-lg border bg-muted/40"><Image src={`/api/images/${documentId}?original=1`} alt={`原图： ${detail.filename}`} width={detail.width ?? 1200} height={detail.height ?? 720} unoptimized className="h-auto max-h-[60dvh] w-full object-contain" onError={() => setError("原图不可用，请重试或检查私有文件存储。")} /></div><figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>原始图片 · 请对照原图核验文字与 AI 解释。</span><a href={`/api/images/${documentId}?original=1`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">查看完整原图</a></figcaption></figure>}
    {!detail && !error && <div role="status" className="space-y-3"><div className="h-4 w-32 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted" /><span className="sr-only">正在加载图片分析…</span></div>}
    {detail && <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">图片</Badge><span>{analysis?.imageType ?? "类型尚未分析"}</span><span>{detail.width} × {detail.height}</span>{analysis?.provider === "mock" && <Badge variant="outline">模拟图像分析</Badge>}</div>
      {evidence && <section className="space-y-2"><h3 className="text-sm font-medium">{evidence.chunkSource === "ocr" ? "引用依据 · 提取文字" : "引用依据 · AI 解读内容"}</h3><mark className="block whitespace-pre-wrap break-words rounded-lg bg-accent p-4 text-sm leading-7 text-foreground">{evidence.content}</mark></section>}
      <section className="space-y-2"><h3 className="text-sm font-medium">提取文字 · OCR</h3>{analysis?.ocr ? <><p className="whitespace-pre-wrap break-words text-sm leading-7">{analysis.ocr.text.trim() || "未检测到可读取的文字。"}</p><p className="text-xs text-muted-foreground">{analysis.ocrEngine} · {Math.round(analysis.ocr.confidence * 100)}% 文字提取可信度</p></> : <p className="text-sm leading-7 text-muted-foreground">{analysis?.ocrStatus === "failed" ? "文字提取失败，可以重新建立知识索引。" : "文字提取不可用，当前没有 OCR 提取结果。"}</p>}</section>
      <section className="space-y-2 border-t pt-5"><h3 className="text-sm font-medium">AI 解读</h3>{analysis?.vision ? <><p className="whitespace-pre-wrap break-words text-sm leading-7">{analysis.vision.summary}</p><p className="text-xs text-muted-foreground">{analysis.provider} / {analysis.model}  · AI 解读 · 请对照原图核对</p></> : <p className="text-sm leading-7 text-muted-foreground">图像理解暂时不可用。{analysis?.ocr ? " 文字提取成功。" : " 分析成功后，才能按内容搜索这张图片。"}</p>}</section>
      {!!analysis?.vision?.topics.length && <section className="space-y-2"><h3 className="text-sm font-medium">主题</h3><p className="text-sm leading-7">{analysis.vision.topics.join(" · ")}</p></section>}
      {!!analysis?.vision?.visibleConcepts.length && <section className="space-y-2"><h3 className="text-sm font-medium">图片概念 · AI 解读</h3><ul className="list-inside list-disc space-y-1 text-sm leading-7">{analysis.vision.visibleConcepts.map(c => <li key={c}>{c}</li>)}</ul></section>}
      {!!analysis?.vision?.tags.length && <div className="flex flex-wrap gap-2" aria-label="图片标签">{analysis.vision.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
      {!!detail.related.length && <section className="space-y-2 border-t pt-5"><h3 className="text-sm font-medium">相关资料 · 共同概念</h3><ul className="space-y-2">{detail.related.map(doc => <li key={doc.id}><Link href={`/library?source=workspace&document=${doc.id}`} className="text-sm text-primary underline underline-offset-4">{doc.name} · {doc.type}</Link></li>)}</ul></section>}
    </>}
  </div>;
}
