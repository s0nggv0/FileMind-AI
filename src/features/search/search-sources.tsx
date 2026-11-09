import { FileText } from "lucide-react";
import type { RAGSource } from "@/lib/retrieval/rag";

type SourceListProps = { sources: RAGSource[]; nearestOnly: boolean; onPreview(source: RAGSource): void };

export function SearchPassages({ sources: shownSources, nearestOnly, onPreview: preview }: SourceListProps) {
  return (
        <article id="search-passages" tabIndex={-1}><h3 className="text-sm font-semibold">{nearestOnly ? "最接近的段落" : "相关资料"}</h3>{nearestOnly && <p className="mt-2 text-xs leading-6 text-muted-foreground">这些是最接近的段落，尚不足以作为回答依据。</p>}<div className="mt-3 divide-y">{shownSources.map((s, i) => <button key={s.id} type="button" data-citation-chunk={s.id} onClick={() => void preview(s)} className="flex w-full gap-3 py-5 text-left"><FileText size={18} className="mt-1 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{s.documentName}</span><span className="mt-1 block text-xs text-muted-foreground">{s.fileType === "image" ? "图片" : s.fileType.toUpperCase()} · {s.location} · 排序 #{i + 1}</span><span className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{s.content}</span></span></button>)}</div>{!shownSources.length && <p className="mt-4 text-sm leading-7 text-muted-foreground">当前范围没有可展示的匹配片段。可以调整问题后重试。</p>}</article>
  );
}

export function SearchSources({ sources: shownSources, nearestOnly, onPreview: preview }: SourceListProps) {
  return (
      <aside className="min-w-0 border-t pt-6 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0"><h3 className="text-sm font-semibold">{nearestOnly ? "最接近的来源" : "来源"}</h3><div className="mt-3 divide-y">{shownSources.map((s, i) => <button key={s.id} type="button" title={s.content.slice(0, 240)} onClick={() => void preview(s)} className="flex w-full gap-3 py-4 text-left"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs text-primary">{i + 1}</span><span className="min-w-0"><span className="block break-words text-sm font-medium">{s.documentName}</span><span className="mt-2 block text-xs text-muted-foreground">{s.location}</span></span></button>)}</div></aside>
  );
}
