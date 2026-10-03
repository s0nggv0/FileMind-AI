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
    catch (e) { setError(e instanceof Error ? e.message : "Index is unavailable."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xs font-medium">Knowledge Index</h3><p role="status" className="mt-2 text-xs text-muted-foreground">{status?.status === "ready" ? `Searchable · ${status.chunks} knowledge segments` : status?.status === "failed" ? "关键词段落可用 · 语义索引待重试" : "尚未建立知识索引"}</p>{(busy||["chunking","embedding"].includes(status?.buildStatus??""))&&<p role="status" className="mt-2 text-xs text-muted-foreground">正在建立替换索引。成功后会一次切换。{status?.status==="ready"&&"当前索引仍可搜索。"}</p>}{["interrupted","failed"].includes(status?.buildStatus??"")&&<p role="status" className="mt-2 text-xs text-muted-foreground">新索引{status?.buildStatus==="interrupted"?"已中断":"未完成"}，可以重试。{status?.status==="ready"&&"当前索引仍可搜索。"}</p>}{status?.status==="stale"&&<p className="mt-2 text-xs text-muted-foreground">资料或模型已变更，需要重新建立索引。</p>}</div><Button size="sm" variant="outline" disabled={busy} onClick={() => void reindex()}>更新索引</Button></div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
