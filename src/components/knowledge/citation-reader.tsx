"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageSourceView } from "./image-source-view";
import { citationLibraryURL, citationURL, returnToSearchURL, type CitationAnchor, type CitationSource } from "@/lib/retrieval/citation-contract";
import type { Evidence } from "@/lib/retrieval/types";

function useCitation(anchor: CitationAnchor, view: "context" | "full") {
  const url = citationURL(anchor, view);
  const [response, setResponse] = useState<{ url: string; data: CitationSource } | null>(null);
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(url, { signal: abort.signal }).then(async result => {
      const data = await result.json();
      if (!result.ok) {
        if (!abort.signal.aborted) setFailure({ url, message: data.reason === "SOURCES_CHANGED" ? "来源已经变化或失效。已保存的片段仍保留，请返回搜索结果后重新搜索；旧位置不会应用到当前正文。" : "暂时无法加载引用原文，请手动重试。" });
        return null;
      }
      return data as CitationSource;
    }).then(data => { if (data && !abort.signal.aborted) { setFailure(null); setResponse({ url, data }); } }).catch(() => {
      if (!abort.signal.aborted) setFailure({ url, message: "暂时无法加载引用原文，请手动重试。" });
    });
    return () => abort.abort();
  }, [url, retry]);
  return { source: response?.url === url ? response.data : null, error: failure?.url === url ? failure.message : "", retry: () => { setFailure(null); setResponse(null); setRetry(value => value + 1); } };
}

export function CitationPassage({ source, full = false }: { source: CitationSource; full?: boolean }) {
  const mark = useRef<HTMLElement | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const position = source.citation;
  useEffect(() => {
    if (full && position?.status === "located" && mark.current && container.current) {
      mark.current.focus({ preventScroll: true });
      const box = container.current, target = mark.current;
      box.scrollTop += target.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 2 + target.getBoundingClientRect().height / 2;
    }
  }, [full, position]);
  const range = position?.range;
  return <div ref={container} className={full ? "max-h-[55dvh] overflow-auto overscroll-contain rounded-lg bg-muted/40 p-4 text-sm leading-8" : "rounded-lg bg-muted/40 p-4 text-sm leading-8"} tabIndex={full ? 0 : undefined} role={full ? "region" : undefined} aria-label={full ? "已提取全文" : "引用与前后文"}>
    {full && position?.text !== undefined ? <div className="whitespace-pre-wrap break-words">{range ? <>{position.text.slice(0, range.start)}<mark ref={mark} tabIndex={-1} aria-label="引用对应的原文" className="rounded bg-accent text-foreground outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">{position.text.slice(range.start, range.end)}</mark>{position.text.slice(range.end)}</> : position.text}</div> : <>
      {position?.before && <p className="whitespace-pre-wrap break-words text-muted-foreground" aria-label="引用前文">{position.before}</p>}
      <mark className="block whitespace-pre-wrap break-words rounded bg-accent text-foreground">{source.content}</mark>
      {position?.after && <p className="whitespace-pre-wrap break-words text-muted-foreground" aria-label="引用后文">{position.after}</p>}
    </>}
  </div>;
}

export function CitationReading({ anchor, runId, savedSource, initiallyFull = false, showImage = true, onBack }: {
  anchor: CitationAnchor; runId?: string; savedSource?: Evidence; initiallyFull?: boolean; showImage?: boolean; onBack?: () => void;
}) {
  const [view, setView] = useState<"context" | "full">(initiallyFull ? "full" : "context");
  const [textVersion, setTextVersion] = useState(anchor.textVersion);
  const { source, error, retry } = useCitation({ ...anchor, ...(textVersion ? { textVersion } : {}) }, view);
  const toggle = useRef<HTMLButtonElement | null>(null), restoreToggle = useRef(false);
  useEffect(() => { if (source && restoreToggle.current) { toggle.current?.focus(); restoreToggle.current = false; } }, [source]);
  const position = source?.citation;
  const originalURL = source ? `/api/documents/${source.documentId}/original${source.documentHash ? `?version=${encodeURIComponent(source.documentHash)}` : ""}${position?.pdfPage ? `#page=${position.pdfPage}` : ""}` : "";
  return <div className="min-w-0 space-y-5">
    <div className="sticky top-0 z-10 flex flex-wrap gap-2 bg-card py-2">
      <Button ref={toggle} type="button" variant="outline" size="sm" disabled={!source || view === "context" && position?.status !== "located"} onClick={() => {
        if (!source) return;
        setTextVersion(position?.textVersion); restoreToggle.current = view === "full";
        setView(view === "context" ? "full" : "context");
      }}>{view === "context" ? "打开全文并定位" : "返回引用片段"}</Button>
      {onBack ? <Button type="button" variant="ghost" size="sm" onClick={onBack}>返回搜索结果</Button> : runId && <Button asChild variant="ghost" size="sm"><Link href={returnToSearchURL(runId, anchor.chunkId)}>返回原搜索结果</Link></Button>}
    </div>
    {error && <div role="alert" className="space-y-3"><p className="text-sm leading-7 text-destructive">{error}</p>{savedSource && <div><p className="mb-2 text-xs text-muted-foreground">当时保存的引用片段</p><blockquote className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-4 text-sm leading-7">{savedSource.content}</blockquote></div>}<Button variant="outline" size="sm" onClick={retry}>重试加载来源</Button></div>}
    {!source && !error && <p role="status" className="text-sm text-muted-foreground">{view === "full" ? "正在核对版本并定位全文…" : "正在加载原始来源与前后文…"}</p>}
    {source && !error && <>
      <div className="space-y-2"><h3 className="text-sm font-medium">{view === "full" ? "已提取全文 · 引用定位" : "提取原文与前后文"}</h3><p className="text-xs leading-6 text-muted-foreground">{position?.label ?? "缺少可靠的位置或版本信息"}</p>
        {(!position || position.status !== "located") && <p role="status" className="text-sm leading-7 text-muted-foreground">缺少可靠的位置或版本信息，不能自动定位这条引用；可查看保存片段，或重新搜索以取得最新引用。</p>}
        {source.fileType === "image" && <p className="text-sm leading-7 text-muted-foreground">{source.chunkSource === "ocr" ? "此引用来自 OCR 文字。" : "此引用来自 AI 解读，需对照原图核对。"}目前没有与该引用可靠对应的区域位置，因此不绘制图片区域高亮。</p>}
        <CitationPassage source={source} full={view === "full"} />
      </div>
      {source.storageStatus === "missing" || source.storageStatus === "not_stored" ? <p role="status" className="text-sm leading-7 text-muted-foreground">原文件不可用 · 仍可核对提取正文</p> : <Button asChild variant="outline" size="sm"><a href={originalURL} target="_blank" rel="noopener noreferrer">打开原文件{position?.pdfPage ? ` · 第 ${position.pdfPage} 页` : ""}</a></Button>}
      {onBack && <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href={citationLibraryURL({ ...anchor, ...(position?.textVersion ? { textVersion: position.textVersion } : {}) }, runId)}>打开资料</Link></Button><Button asChild variant="ghost" size="sm"><Link href="/graph?source=workspace">查看相关知识</Link></Button></div>}
      {source.summary && <div><h3 className="text-xs font-medium text-muted-foreground">AI 摘要</h3><p className="mt-2 text-sm leading-7">{source.summary}</p></div>}
      {!!source.tags.length && <div className="flex flex-wrap gap-2">{source.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
      {showImage && source.fileType === "image" && <ImageSourceView documentId={source.documentId} evidence={source} showCitation={false} />}
    </>}
  </div>;
}
