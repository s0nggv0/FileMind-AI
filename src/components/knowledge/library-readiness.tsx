"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ReadinessDocument } from "@/lib/retrieval/readiness";
import { useIndexStatus } from "@/lib/retrieval/use-index-status";
import { useSearchPreparation } from "@/lib/retrieval/use-search-preparation";
export function LibraryReadiness({ workspaceId, documentIds, onDocuments }: { workspaceId?: string; documentIds?: string[]; onDocuments?: (documents: ReadinessDocument[]) => void }) {
  const { data, error, refresh } = useIndexStatus({ workspaceId, documentIds });
  const preparation = useSearchPreparation({ workspaceId, documentIds });
  useEffect(() => { if (data) onDocuments?.(data.documents); }, [data, onDocuments]);
  const state = data?.summary;
  return <div className="space-y-2 text-left text-sm" aria-live="polite">
    {state ? <><p>{state.total === 0 ? "尚未导入资料 · 可搜索 0 份" : `已保存 ${state.total} 份 · 可搜索 ${state.searchable} 份 · ${data.mock ? "模拟搜索就绪" : "语义搜索就绪"} ${state.semantic} 份`}</p>
      {state.processing > 0 && <p className="text-muted-foreground">正在准备 {state.processing} 份资料，准备完成后即可按内容查找。</p>}
      {state.partial > 0 && <p className="text-muted-foreground">部分能力未完成。已有文字片段可继续搜索；图片中的图形含义需对照原图核对。</p>}
      {state.replacementFailed > 0 && <p className="text-muted-foreground">{state.replacementFailed} 份替换索引失败或中断，可重试；当前可用索引仍可搜索。</p>}
      {state.total > state.searchable && !state.processing && <p className="text-muted-foreground">部分资料已保存但尚不可按内容搜索。准备搜索后再试；无可提取文字的扫描 PDF 需先转为文字或单页图片。</p>}
      {!state.total ? <Button asChild size="sm"><Link href="/workspace">导入第一批资料</Link></Button> : state.retryable > 0 && <Button size="sm" variant="outline" disabled={preparation.busy} onClick={() => void preparation.run()}>{preparation.busy ? "正在准备…" : "准备或重试未完成资料"}</Button>}
    </> : !error && <p>正在确认可搜索资料数量…</p>}
    {(error || preparation.error) && <div role="alert" className="space-y-2"><p className="text-destructive">{error || preparation.error}</p><Button size="sm" variant="outline" onClick={() => void refresh().catch(() => {})}>刷新准备状态</Button></div>}
  </div>;
}
