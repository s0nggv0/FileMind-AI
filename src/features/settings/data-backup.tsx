"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Preview {
  createdAt: string; filemindVersion: string; workspaces: number; documents: number;
  files: number; images: number; chunks: number; embeddingModel: string | null;
  embeddingCompatible: boolean; visionCompatible: boolean; duplicates: number;
}
interface Restored { documents: number; skippedDocuments: number; workspaceIds: string[]; reindexRequired: boolean }
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function jsonResponse(response: Response) {
  const value = await response.json(); if (!response.ok) throw new Error(value.error || "备份请求失败，请重试。"); return value;
}
export function DataBackup() {
  const [available, setAvailable] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skip, setSkip] = useState(true);
  const [busy, setBusy] = useState(""); const [stage, setStage] = useState("");
  const [error, setError] = useState(""); const [restored, setRestored] = useState<Restored | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/identity", { cache: "no-store", signal: controller.signal }).then(jsonResponse).then(value => { setAvailable(value.available); setLastBackup(value.lastBackupAt ?? null); }).catch(() => {});
    return () => controller.abort();
  }, []);
  async function exportBackup() {
    setBusy("export"); setError(""); setStage("正在准备备份信息");
    try {
      const response = await fetch("/api/backup/export", { method: "POST" });
      if (!response.ok) await jsonResponse(response);
      const reader = response.body?.getReader(); if (!reader) throw new Error("导出未能开始，请重试。");
      const decoder = new TextDecoder(); let pending = "", completed = false;
      while (true) {
        const { done, value } = await reader.read(); pending += decoder.decode(value, { stream: !done });
        if (pending.length > 180 * 1024 * 1024) { await reader.cancel(); throw new Error("备份超过浏览器下载限制。"); }
        const lines = pending.split("\n"); pending = lines.pop()!;
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.type === "stage") setStage(event.stage);
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "result") {
            const decoded = atob(event.base64); const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
            saveBlob(new Blob([bytes], { type: "application/zip" }), event.filename); setLastBackup(event.createdAt); completed = true;
          }
        }
        if (done) break;
      }
      if (!completed) throw new Error("导出已中断，请重试。");
      setStage("备份已下载。");
    } catch (e) { setStage(""); setError(e instanceof Error ? e.message : "导出失败，请重试。"); }
    finally { setBusy(""); }
  }
  async function validate() {
    if (!file) return; setBusy("validate"); setError(""); setPreview(null); setRestored(null);
    try {
      if (!file.name.endsWith(".filemind-backup")) throw new Error("请选择 .filemind-backup 备份文件。");
      if (file.size > 128 * 1024 * 1024) throw new Error("备份文件必须小于 128 MiB。");
      setPreview(await jsonResponse(await fetch("/api/backup/validate", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file })));
    } catch (e) { setError(e instanceof Error ? e.message : "校验失败，请选择有效备份后重试。"); }
    finally { setBusy(""); }
  }
  async function importBackup() {
    if (!file || !preview) return; setBusy("import"); setError("");
    try {
      setRestored(await jsonResponse(await fetch(`/api/backup/import?skipDuplicates=${skip}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file })));
      setPreview(null); setFile(null); if (input.current) input.current.value = "";
    } catch (e) { setError(e instanceof Error ? e.message : "导入失败，未恢复任何资料。请重试。"); }
    finally { setBusy(""); }
  }
  async function reindex() {
    if (!restored) return; setBusy("reindex"); setError("");
    try {
      for (const workspaceId of restored.workspaceIds) {
        const value = await jsonResponse(await fetch("/api/index", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId }) }));
        if (value.results?.some((item: { status: string }) => item.status !== "ready")) throw new Error("部分资料未能建立索引，请检查模型配置后重试。");
      }
      setRestored({ ...restored, reindexRequired: false }); setStage("知识索引已更新。");
    } catch (e) { setError(e instanceof Error ? e.message : "索引失败，请检查模型配置后重试。"); }
    finally { setBusy(""); }
  }
  return <section className="border-t pt-7" aria-labelledby="backup-heading">
    <h2 id="backup-heading" className="text-base font-semibold">数据与备份</h2>
    <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">导出资料、原文件、分析结果与知识索引，迁移到另一个 FileMind 环境。备份不包含恢复密钥或服务器凭据。</p>
    <p className="mt-3 max-w-2xl text-sm leading-7">备份包含原文件和知识数据，未加密，请保存在安全位置。</p>
    <p className="mt-4 text-sm text-muted-foreground">最近备份： {lastBackup ? new Date(lastBackup).toLocaleString("zh-CN") : "尚未导出"}</p>
    <Button variant="outline" className="mt-4" disabled={!available || !!busy} onClick={() => void exportBackup()}>{busy === "export" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}导出 FileMind 备份</Button>
    {stage && <p role="status" className="mt-3 text-sm">{stage}</p>}
    <div className="mt-7 max-w-2xl space-y-3">
      <h3 className="text-sm font-medium">导入到当前身份</h3>
      <p className="text-sm leading-7 text-muted-foreground">先校验，再查看导入预览。导入会合并到当前身份，保留现有资料。</p>
      <label htmlFor="backup-file" className="block text-sm">FileMind 备份文件</label>
      <input ref={input} id="backup-file" type="file" accept=".filemind-backup" disabled={!available || !!busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setRestored(null); setError(""); }} className="block w-full min-w-0 rounded-md border bg-background p-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-2 file:text-foreground" />
      <Button variant="outline" disabled={!file || !!busy} onClick={() => void validate()}>{busy === "validate" && <Loader2 size={16} className="animate-spin" />}校验备份</Button>
      {preview && <div className="space-y-4 border-y py-5" aria-label="备份导入预览">
        <p role="status" className="text-sm font-medium">完整性校验通过，可以导入</p>
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
          {[["备份创建时间", new Date(preview.createdAt).toLocaleString("zh-CN")], ["FileMind 版本", preview.filemindVersion], ["工作区", preview.workspaces], ["资料", preview.documents], ["文件", preview.files], ["图片", preview.images], ["资料片段", preview.chunks], ["向量模型", preview.embeddingModel || "未配置"], ["重复资料", preview.duplicates]].map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="break-words tabular-nums">{value}</dd></div>)}
        </dl>
        {(!preview.embeddingCompatible || !preview.visionCompatible) && <p className="text-sm leading-7">模型配置与备份不一致。资料会完整恢复，受影响的索引将等待重新构建。</p>}
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} disabled={!!busy} className="size-4 accent-primary" />跳过重复资料</label>
        <div className="flex flex-wrap gap-3"><Button disabled={!!busy} onClick={() => void importBackup()}>{busy === "import" ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}导入备份</Button><Button variant="ghost" disabled={!!busy} onClick={() => { setFile(null); setPreview(null); if (input.current) input.current.value = ""; }}>取消</Button></div>
      </div>}
      {restored && <div className="space-y-3 py-3"><p role="status" className="text-sm">恢复了 {restored.documents} 份资料，跳过 {restored.skippedDocuments} 份重复文件。</p>{restored.reindexRequired && <Button disabled={!!busy} variant="outline" onClick={() => void reindex()}>{busy === "reindex" && <Loader2 size={16} className="animate-spin" />}重建已恢复资料的索引</Button>}<Button variant="outline" asChild><Link href="/library?source=workspace">打开恢复后的资料库</Link></Button></div>}
      {!available && <p className="text-sm leading-7 text-muted-foreground">请先配置 FileMind 数据库存储，再导出或导入备份。</p>}
      {error && <p role="alert" className="text-sm leading-7 text-destructive">{error}</p>}
    </div>
  </section>;
}
