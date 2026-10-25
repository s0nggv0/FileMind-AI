"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { readiness, type ReadinessDocument } from "@/lib/retrieval/readiness";
import { prepareSearch } from "@/lib/retrieval/prepare-search";
export function LibraryReadiness({ workspaceId, documentIds, onDocuments }: { workspaceId?: string; documentIds?: string[]; onDocuments?: (documents: ReadinessDocument[]) => void }) {
  const [mock,setMock]=useState(false);
  const [documents, setDocuments] = useState<ReadinessDocument[] | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const ids = documentIds?.join(",");
  useEffect(() => {
    const controller = new AbortController();
    const read = async () => {
      try { const response = await fetch("/api/index", { signal: controller.signal }); if (!response.ok) throw new Error();
        const data = await response.json(); const docs = (data.documents as ReadinessDocument[]).filter(d => (!workspaceId || d.workspaceId === workspaceId) && (!ids || ids.split(",").includes(d.id)));
        if (!controller.signal.aborted) { setDocuments(docs); setMock(data.mock === true); onDocuments?.(docs); setError(""); }
      } catch { if (!controller.signal.aborted) setError("暂时无法确认资料准备状态，请稍后重试。"); }
    };
    void read(); const timer = setInterval(() => void read(), 4000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [workspaceId, ids, onDocuments]);
  async function retry() {
    if (!documents) return; setBusy(true); setError("");
    try {
      const { results, documents: refreshed } = await prepareSearch({ workspaceId, documentIds });
      setDocuments(refreshed); onDocuments?.(refreshed);
      if (results.some(r => r.status === "failed")) throw new Error();
    } catch { setError("部分资料尚未准备完成。可在资料详情重试，或在设置查看服务配置说明。"); }
    finally { setBusy(false); }
  }
  const state = documents ? readiness(documents) : null;
  return <div className="space-y-2 text-left text-sm" aria-live="polite">
    {state ? <><p>{state.total === 0 ? "尚未导入资料 · 可搜索 0 份" : `已保存 ${state.total} 份 · 可搜索 ${state.searchable} 份 · ${mock ? "模拟搜索就绪" : "语义搜索就绪"} ${state.semantic} 份`}</p>
      {state.processing > 0 && <p className="text-muted-foreground">正在准备 {state.processing} 份资料，准备完成后即可按内容查找。</p>}
      {state.partial > 0 && <p className="text-muted-foreground">部分能力未完成。已有文字片段可继续搜索；图片中的图形含义需对照原图核对。</p>}
      {state.replacementFailed > 0 && <p className="text-muted-foreground">{state.replacementFailed} 份替换索引失败或中断，可重试；当前可用索引仍可搜索。</p>}
      {state.total > state.searchable && !state.processing && <p className="text-muted-foreground">部分资料已保存但尚不可按内容搜索。准备搜索后再试；无可提取文字的扫描 PDF 需先转为文字或单页图片。</p>}
      {!state.total ? <Button asChild size="sm"><Link href="/workspace">导入第一批资料</Link></Button> : state.retryable > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={() => void retry()}>{busy ? "正在准备…" : "准备或重试未完成资料"}</Button>}
    </> : <p>正在确认可搜索资料数量…</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>;
}
