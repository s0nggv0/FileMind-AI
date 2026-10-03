"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MultimodalAnalysis } from "@/lib/multimodal/schemas";
import type { Evidence } from "@/lib/retrieval/types";
interface ImageDetail { filename: string; width: number | null; height: number | null; analysis: MultimodalAnalysis | null; related: { id: string; name: string; type: string }[] }
export function ImageSourceView({ documentId, evidence }: { documentId: string; evidence?: Evidence }) {
  const [detail, setDetail] = useState<ImageDetail | null>(null); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/images/${documentId}`, { signal: abort.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; }).then(setDetail).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Image source unavailable. Try reopening it."); });
    return () => abort.abort();
  }, [documentId, retry]);
  const analysis = detail?.analysis;
  return <div className="space-y-6">
    {error ? <div role="alert" className="space-y-3 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={() => { setError(""); setRetry(v => v + 1); }}>重试加载图片</Button></div> : <figure className="space-y-2"><div className="overflow-hidden rounded-lg border bg-muted/40"><Image src={`/api/images/${documentId}?original=1`} alt={`Original image: ${detail?.filename ?? "knowledge source"}`} width={detail?.width ?? 1200} height={detail?.height ?? 720} unoptimized className="h-auto max-h-[60dvh] w-full object-contain" onError={() => setError("Original image is unavailable. Retry or check private storage.")} /></div><figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>原始图片 · 请对照原图核验文字与 AI 解释。</span><a href={`/api/images/${documentId}?original=1`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">View full-size image</a></figcaption></figure>}
    {!detail && !error && <div role="status" className="space-y-3"><div className="h-4 w-32 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted" /><span className="sr-only">Loading image analysis...</span></div>}
    {detail && <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">Image</Badge><span>{analysis?.imageType ?? "Type not analyzed"}</span><span>{detail.width} × {detail.height}</span>{analysis?.provider === "mock" && <Badge variant="outline">Mock Vision</Badge>}</div>
      {evidence && <section className="space-y-2"><h3 className="text-sm font-medium">{evidence.chunkSource === "ocr" ? "Cited evidence · Extracted text" : "Cited evidence · AI interpreted content"}</h3><mark className="block whitespace-pre-wrap break-words rounded-lg bg-accent p-4 text-sm leading-7 text-foreground">{evidence.content}</mark></section>}
      <section className="space-y-2"><h3 className="text-sm font-medium">Extracted Text · OCR</h3>{analysis?.ocr ? <><p className="whitespace-pre-wrap break-words text-sm leading-7">{analysis.ocr.text.trim() || "No readable text detected."}</p><p className="text-xs text-muted-foreground">{analysis.ocrEngine} · {Math.round(analysis.ocr.confidence * 100)}% extraction confidence</p></> : <p className="text-sm leading-7 text-muted-foreground">{analysis?.ocrStatus === "failed" ? "Text extraction failed. You can retry the knowledge index." : "Text extraction is unavailable. No OCR original text is claimed."}</p>}</section>
      <section className="space-y-2 border-t pt-5"><h3 className="text-sm font-medium">AI Interpretation</h3>{analysis?.vision ? <><p className="whitespace-pre-wrap break-words text-sm leading-7">{analysis.vision.summary}</p><p className="text-xs text-muted-foreground">{analysis.provider} / {analysis.model} · AI interpretation · verify against the original image</p></> : <p className="text-sm leading-7 text-muted-foreground">Visual understanding unavailable.{analysis?.ocr ? " Text extraction succeeded." : " This image is not searchable by content until analysis succeeds."}</p>}</section>
      {!!analysis?.vision?.topics.length && <section className="space-y-2"><h3 className="text-sm font-medium">Topics</h3><p className="text-sm leading-7">{analysis.vision.topics.join(" · ")}</p></section>}
      {!!analysis?.vision?.visibleConcepts.length && <section className="space-y-2"><h3 className="text-sm font-medium">Visible Concepts · AI interpretation</h3><ul className="list-inside list-disc space-y-1 text-sm leading-7">{analysis.vision.visibleConcepts.map(c => <li key={c}>{c}</li>)}</ul></section>}
      {!!analysis?.vision?.tags.length && <div className="flex flex-wrap gap-2" aria-label="Image tags">{analysis.vision.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
      {!!detail.related.length && <section className="space-y-2 border-t pt-5"><h3 className="text-sm font-medium">Related Documents · shared concepts</h3><ul className="space-y-2">{detail.related.map(doc => <li key={doc.id}><Link href={`/library?source=workspace&document=${doc.id}`} className="text-sm text-primary underline underline-offset-4">{doc.name} · {doc.type}</Link></li>)}</ul></section>}
    </>}
  </div>;
}
