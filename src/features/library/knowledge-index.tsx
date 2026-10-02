"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
export function KnowledgeIndex({ documentId }: { documentId: string }) {
  const [status, setStatus] = useState<{ status: string; chunks: number } | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const read = () => { void fetch("/api/index", { signal: abort.signal }).then(r => r.json()).then(data => setStatus(data.documents?.find((d: { id: string }) => d.id === documentId) ?? null)).catch(() => {}); };
    read(); const timer = setInterval(read, 3000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [documentId]);
  async function reindex() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/index", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); const result = data.results[0]; if (result) setStatus({ status: result.status, chunks: result.chunks ?? 0 }); }
    catch (e) { setError(e instanceof Error ? e.message : "Index is unavailable."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xs font-medium">Knowledge Index</h3><p role="status" className="mt-2 text-xs text-muted-foreground">{busy || ["chunking", "embedding"].includes(status?.status ?? "") ? "Indexing..." : status?.status === "ready" ? `Searchable · ${status.chunks} knowledge segments` : status?.status === "failed" ? "关键词段落可用 · 语义索引待重试" : "尚未建立知识索引"}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => void reindex()}>更新索引</Button></div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
