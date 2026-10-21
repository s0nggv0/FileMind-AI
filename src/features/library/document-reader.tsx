"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { categoryLabel } from "@/lib/ui-labels";
import type { ReadableDocument } from "@/lib/workspace/document-reader";
export function DocumentReading({ documentId, onSaved }: { documentId: string; onSaved: (document: ReadableDocument) => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ReadableDocument | null>(null);
  const [category, setCategory] = useState(""); const [tags, setTags] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/documents/${documentId}`, { signal: abort.signal }).then(async r => { if (!r.ok) throw new Error("无法加载资料，请重新打开详情或重试。"); return r.json(); }).then((data: ReadableDocument) => { setDetail(data); setCategory(categoryLabel(data.category ?? "Uncategorized")); setTags(data.tags.join("，")); }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [documentId, retry]);
  async function save() {
    if (!detail) return; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: detail.revision, category: category === categoryLabel(detail.category ?? "Uncategorized") ? detail.category ?? "Uncategorized" : category, tags: tags.split(/[,，\n]/).map(t => t.trim()).filter(Boolean) }) });
      const data = await response.json(); if (!response.ok) throw new Error(response.status === 400 ? "请填写分类；最多 8 个标签，每个不超过 40 字。" : data.error);
      setDetail(data); setTags(data.tags.join("，")); onSaved(data); router.refresh(); setMessage("分类与标签已保存，资料库与后续搜索将使用这些修改。");
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试。"); } finally { setBusy(false); }
  }
  return <div className="space-y-5 border-t pt-4">
    <div className="flex flex-wrap gap-2"><Button asChild size="sm"><Link href={`/search?document=${documentId}`}>向这份资料提问</Link></Button>{detail?.storageStatus === "available" && <Button asChild variant="outline" size="sm"><a href={`/api/documents/${documentId}/original`} target="_blank" rel="noopener noreferrer">打开或下载原文件</a></Button>}</div>
    {detail && detail.storageStatus !== "available" && <p role="status" className="text-sm leading-7 text-muted-foreground">原文件暂不可用。已保存的提取全文、摘要、分类和标签仍可阅读；能否搜索请看下方准备状态。</p>}
    {!detail && !error && <p role="status" className="text-sm">正在加载提取全文…</p>}
    {detail && <><details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">查看已提取全文 · {detail.text.length.toLocaleString()} 字符</summary><div className="max-h-[50dvh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-4 text-sm leading-8">{detail.text || "未提取到可阅读文字。扫描 PDF 请先转为可选中文字的 PDF 或单页图片。"}</div>{detail.metadata.truncated && <p className="mt-2 text-sm text-muted-foreground">提取已达到上限，此处仅为已保存部分，请打开原文件阅读完整内容。</p>}</details>
      <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-3"><h3 className="text-sm font-medium">修改分类和标签</h3><label className="block text-xs">分类<Input value={category} maxLength={80} required onChange={e => setCategory(e.target.value)} className="mt-2" /></label><label className="block text-xs">标签（用逗号分隔，最多 8 个；按需填写）<Input value={tags} onChange={e => setTags(e.target.value)} className="mt-2" /></label><Button size="sm" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存分类与标签"}</Button></form></>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}{error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={() => { setError(""); setRetry(v => v + 1); }}>重新加载最新资料</Button></div>}
  </div>;
}
