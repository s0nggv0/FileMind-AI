"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
export function KnowledgeIndex({ documentId }: { documentId: string }) {
  const [status, setStatus] = useState<{ status: string; chunks: number;buildStatus?:string } | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const read = () => { void fetch("/api/index", { signal: abort.signal }).then(async r => {if(!r.ok)throw new Error("索引状态暂时不可用，请重试。");return r.json();}).then(data => {if(!abort.signal.aborted){setStatus(data.documents?.find((d: { id: string }) => d.id === documentId) ?? null);setError("");}}).catch(()=>{if(!abort.signal.aborted)setError("索引状态暂时不可用，请重试。");}); };
    read(); const timer = setInterval(read, 3000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [documentId]);
  async function reindex() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/index", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); const result = data.results[0]; if (result) setStatus({ status: result.status, chunks: result.chunks ?? 0 }); }
    catch (e) { setError(e instanceof Error ? e.message : "索引暂时不可用。"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xs font-medium">搜索准备</h3><p role="status" className="mt-2 text-xs text-muted-foreground">{status?.status === "ready" ? `可搜索 ·  ${status.chunks} 个资料片段` : status?.status === "failed" ? status.chunks > 0 ? "已提取文字可用于关键词搜索 · 按含义搜索尚未就绪" : "已保存，但没有可搜索片段。请检查提取全文或重试。" : "尚未建立知识索引"}</p>{(busy||["chunking","embedding"].includes(status?.buildStatus??""))&&<p role="status" className="mt-2 text-xs text-muted-foreground">正在建立替换索引。成功后会一次切换。{status?.status==="ready"&&"当前索引仍可搜索。"}</p>}{["interrupted","failed"].includes(status?.buildStatus??"")&&<p role="status" className="mt-2 text-xs text-muted-foreground">新索引{status?.buildStatus==="interrupted"?"已中断":"未完成"}，可以重试。{status?.status==="ready"&&"当前索引仍可搜索。"}</p>}{status?.status==="stale"&&<p className="mt-2 text-xs text-muted-foreground">资料或模型已变更，需要重新建立索引。</p>}</div><Button size="sm" variant="outline" disabled={busy} onClick={() => void reindex()}>准备或重试搜索</Button></div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
