"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { KnowledgeIndex } from "@/features/library/knowledge-index";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MultimodalAnalysis } from "@/lib/multimodal/schemas";
import type { Evidence } from "@/lib/retrieval/types";
interface ImageDetail { filename: string; width: number | null; height: number | null; storageStatus?:string; analysis: MultimodalAnalysis | null; related: { id: string; name: string; type: string }[] }
export function ImageSourceView({ documentId, evidence, showCitation = true }: { documentId: string; evidence?: Evidence; showCitation?: boolean }) {
  const [busy, setBusy] = useState(false); const [retryMessage, setRetryMessage] = useState("");
  const [detail, setDetail] = useState<ImageDetail | null>(null); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/images/${documentId}`, { signal: abort.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; }).then(setDetail).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "图片来源不可用，请重新打开。"); });
    return () => abort.abort();
  }, [documentId, retry]);
  async function retryAnalysis() {
    setBusy(true); setRetryMessage("");
    try { const response = await fetch("/api/index", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId }) }); const data=await response.json(); if(!response.ok)throw new Error(data.error); const refreshed=await fetch(`/api/images/${documentId}`).then(r=>r.ok?r.json():null);if(refreshed)setDetail(refreshed);setRetryMessage(data.results?.some((r:{status:string})=>r.status === "failed") || refreshed?.analysis?.visionStatus !== "ready" || refreshed?.analysis?.ocrStatus !== "ready" ? "部分能力仍未完成。已提取内容保留，请核对下方状态或查看服务配置说明。" : "处理已完成，请核对下方各项状态。");setRetry(v=>v+1); } catch { setRetryMessage("暂时无法补全图片能力，已有结果仍保留。请稍后重试或查看配置说明。"); } finally { setBusy(false); }
  }
  const analysis = detail?.analysis;
  return <div className="space-y-6">
    {error ? <div role="alert" className="space-y-3 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={() => { setError(""); setRetry(v => v + 1); }}>重试加载图片</Button></div> : ["missing","not_stored"].includes(detail?.storageStatus??"") ? <p role="status" className="text-sm leading-7 text-muted-foreground">原文件不可用 · 仍可查看已保存的 OCR 和 AI 分析。</p> : detail && <figure className="space-y-2"><div className="overflow-hidden rounded-lg border bg-muted/40"><Image src={`/api/images/${documentId}?original=1`} alt={`原图： ${detail.filename}`} width={detail.width ?? 1200} height={detail.height ?? 720} unoptimized className="h-auto max-h-[60dvh] w-full object-contain" onError={() => setError("原图不可用，请重试或检查私有文件存储。")} /></div><figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>原始图片 · 请对照原图核验文字与 AI 解释。</span><a href={`/api/images/${documentId}?original=1`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">查看完整原图</a></figcaption></figure>}
    {!detail && !error && <div role="status" className="space-y-3"><div className="h-4 w-32 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted" /><span className="sr-only">正在加载图片分析…</span></div>}
    {detail && <>
      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-4 text-xs"><div><dt>原件保存</dt><dd className="mt-1">{detail.storageStatus === "available" ? "原图可打开" : "原图不可用"}</dd></div><div><dt>文字提取</dt><dd className="mt-1">{analysis?.ocr ? analysis.ocrStatus === "stale" ? "保留上次结果，新处理未完成" : "可阅读已提取文字" : "尚无可用结果"}</dd></div><div><dt>AI 图像解读</dt><dd className="mt-1">{analysis?.vision ? analysis.visionStatus === "stale" ? "保留上次解读，新处理未完成" : "已有解读，需核对原图" : analysis?.visionStatus === "disabled" ? "未启用或配置未通过检查" : "解读未完成"}</dd></div><div><dt>搜索范围</dt><dd className="mt-1">{analysis?.ocr || analysis?.vision ? "以搜索准备状态为准；仅使用已提取内容" : "暂无可按内容搜索的信息"}</dd></div></dl>
      <KnowledgeIndex documentId={documentId} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">图片</Badge><span>{analysis?.imageType ?? "类型尚未分析"}</span><span>{detail.width} × {detail.height}</span>{analysis?.provider === "mock" && <Badge variant="outline">模拟图像分析</Badge>}</div>
      {evidence && showCitation && <section className="space-y-2"><h3 className="text-sm font-medium">{evidence.chunkSource === "ocr" ? "引用依据 · 提取文字" : "引用依据 · AI 解读内容"}</h3><mark className="block whitespace-pre-wrap break-words rounded-lg bg-accent p-4 text-sm leading-7 text-foreground">{evidence.content}</mark></section>}
      <section className="space-y-2"><h3 className="text-sm font-medium">提取文字 · OCR</h3>{analysis?.ocr ? <><p className="whitespace-pre-wrap break-words text-sm leading-7">{analysis.ocr.text.trim() || "未检测到可读取的文字。"}</p><p className="text-xs text-muted-foreground">{analysis.ocrEngine} · {Math.round(analysis.ocr.confidence * 100)}% 文字提取可信度</p></> : <p className="text-sm leading-7 text-muted-foreground">{analysis?.ocrStatus === "failed" ? "文字提取失败，可以重新建立知识索引。" : "文字提取不可用，当前没有 OCR 提取结果。"}</p>}</section>
      <section className="space-y-2 border-t pt-5"><h3 className="text-sm font-medium">AI 解读</h3>{analysis?.vision ? <><p className="whitespace-pre-wrap break-words text-sm leading-7">{analysis.vision.summary}</p><p className="text-xs text-muted-foreground">{analysis.provider} / {analysis.model}  · AI 解读 · 请对照原图核对</p></> : <p className="text-sm leading-7 text-muted-foreground">图像理解暂时不可用。{analysis?.ocr ? " 文字提取成功；回答只覆盖已提取文字，无法据此确认图表关系或未提取的内容。" : " 分析成功后，才能按内容搜索这张图片。"}</p>}</section>
      {(!analysis?.vision || !analysis?.ocr || analysis.visionStatus === "stale" || analysis.ocrStatus === "stale") && <div className="space-y-3 rounded-lg border p-4"><p className="text-sm leading-7 text-muted-foreground">重试只补全这张图片，复用已成功的文字提取和图像解读。图像解读需正确配置并验证云端服务。</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || detail.storageStatus !== "available"} onClick={()=>void retryAnalysis()}>{busy ? "正在补全…" : "重试这张图片未完成的能力"}</Button><Button size="sm" asChild variant="ghost"><Link href="/settings#services">查看配置与处理说明</Link></Button></div>{retryMessage && <p role="status" className="text-sm">{retryMessage}</p>}</div>}
      {!!analysis?.vision?.topics.length && <section className="space-y-2"><h3 className="text-sm font-medium">主题</h3><p className="text-sm leading-7">{analysis.vision.topics.join(" · ")}</p></section>}
      {!!analysis?.vision?.visibleConcepts.length && <section className="space-y-2"><h3 className="text-sm font-medium">图片概念 · AI 解读</h3><ul className="list-inside list-disc space-y-1 text-sm leading-7">{analysis.vision.visibleConcepts.map(c => <li key={c}>{c}</li>)}</ul></section>}
      {!!analysis?.vision?.tags.length && <div className="flex flex-wrap gap-2" aria-label="图片标签">{analysis.vision.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
      {!!detail.related.length && <section className="space-y-2 border-t pt-5"><h3 className="text-sm font-medium">相关资料 · 共同概念</h3><ul className="space-y-2">{detail.related.map(doc => <li key={doc.id}><Link href={`/library?source=workspace&document=${doc.id}`} className="text-sm text-primary underline underline-offset-4">{doc.name} · {doc.type}</Link></li>)}</ul></section>}
    </>}
  </div>;
}
