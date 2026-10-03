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
  const value = await response.json(); if (!response.ok) throw new Error(value.error || "Backup request failed. Please retry."); return value;
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
    setBusy("export"); setError(""); setStage("Preparing metadata");
    try {
      const response = await fetch("/api/backup/export", { method: "POST" });
      if (!response.ok) await jsonResponse(response);
      const reader = response.body?.getReader(); if (!reader) throw new Error("Export did not start. Please retry.");
      const decoder = new TextDecoder(); let pending = "", completed = false;
      while (true) {
        const { done, value } = await reader.read(); pending += decoder.decode(value, { stream: !done });
        if (pending.length > 180 * 1024 * 1024) { await reader.cancel(); throw new Error("Backup exceeds browser download limits."); }
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
      if (!completed) throw new Error("Export was interrupted. Please retry.");
      setStage("Completed — backup downloaded.");
    } catch (e) { setStage(""); setError(e instanceof Error ? e.message : "Export failed. Please retry."); }
    finally { setBusy(""); }
  }
  async function validate() {
    if (!file) return; setBusy("validate"); setError(""); setPreview(null); setRestored(null);
    try {
      if (!file.name.endsWith(".filemind-backup")) throw new Error("Choose a .filemind-backup file.");
      if (file.size > 128 * 1024 * 1024) throw new Error("Backup must be smaller than 128 MiB.");
      setPreview(await jsonResponse(await fetch("/api/backup/validate", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file })));
    } catch (e) { setError(e instanceof Error ? e.message : "Validation failed. Choose a valid backup and retry."); }
    finally { setBusy(""); }
  }
  async function importBackup() {
    if (!file || !preview) return; setBusy("import"); setError("");
    try {
      setRestored(await jsonResponse(await fetch(`/api/backup/import?skipDuplicates=${skip}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file })));
      setPreview(null); setFile(null); if (input.current) input.current.value = "";
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed. No data was restored. Please retry."); }
    finally { setBusy(""); }
  }
  async function reindex() {
    if (!restored) return; setBusy("reindex"); setError("");
    try {
      for (const workspaceId of restored.workspaceIds) {
        const value = await jsonResponse(await fetch("/api/index", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId }) }));
        if (value.results?.some((item: { status: string }) => item.status !== "ready")) throw new Error("Some documents could not be indexed. Check model configuration and retry.");
      }
      setRestored({ ...restored, reindexRequired: false }); setStage("Knowledge index updated.");
    } catch (e) { setError(e instanceof Error ? e.message : "Indexing failed. Check model configuration and retry."); }
    finally { setBusy(""); }
  }
  return <section className="border-t pt-7" aria-labelledby="backup-heading">
    <h2 id="backup-heading" className="text-base font-semibold">Data &amp; Backup</h2>
    <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">导出资料、原文件、分析结果与知识索引，迁移到另一个 FileMind 环境。备份不包含恢复密钥或服务器凭据。</p>
    <p className="mt-3 max-w-2xl text-sm leading-7">Backup contains your original files and knowledge data. 备份未加密，请保存在安全位置。</p>
    <p className="mt-4 text-sm text-muted-foreground">Last backup: {lastBackup ? new Date(lastBackup).toLocaleString() : "尚未导出"}</p>
    <Button variant="outline" className="mt-4" disabled={!available || !!busy} onClick={() => void exportBackup()}>{busy === "export" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Export FileMind Backup</Button>
    {stage && <p role="status" className="mt-3 text-sm">{stage}</p>}
    <div className="mt-7 max-w-2xl space-y-3">
      <h3 className="text-sm font-medium">Import into current identity</h3>
      <p className="text-sm leading-7 text-muted-foreground">先校验，再查看导入预览。导入会合并到当前身份，保留现有资料。</p>
      <label htmlFor="backup-file" className="block text-sm">FileMind Backup file</label>
      <input ref={input} id="backup-file" type="file" accept=".filemind-backup" disabled={!available || !!busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setRestored(null); setError(""); }} className="block w-full min-w-0 rounded-md border bg-background p-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-2 file:text-foreground" />
      <Button variant="outline" disabled={!file || !!busy} onClick={() => void validate()}>{busy === "validate" && <Loader2 size={16} className="animate-spin" />}Validate Backup</Button>
      {preview && <div className="space-y-4 border-y py-5" aria-label="Backup import preview">
        <p role="status" className="text-sm font-medium">Integrity verified — ready to import</p>
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
          {[["Backup created", new Date(preview.createdAt).toLocaleString()], ["FileMind version", preview.filemindVersion], ["Workspaces", preview.workspaces], ["Documents", preview.documents], ["Files", preview.files], ["Images", preview.images], ["Chunks", preview.chunks], ["Embedding model", preview.embeddingModel || "未配置"], ["Duplicate documents", preview.duplicates]].map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="break-words tabular-nums">{value}</dd></div>)}
        </dl>
        {(!preview.embeddingCompatible || !preview.visionCompatible) && <p className="text-sm leading-7">模型配置与备份不一致。资料会完整恢复，受影响的索引将等待重新构建。</p>}
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} disabled={!!busy} className="size-4 accent-primary" />Skip duplicate documents</label>
        <div className="flex flex-wrap gap-3"><Button disabled={!!busy} onClick={() => void importBackup()}>{busy === "import" ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}Import Backup</Button><Button variant="ghost" disabled={!!busy} onClick={() => { setFile(null); setPreview(null); if (input.current) input.current.value = ""; }}>Cancel</Button></div>
      </div>}
      {restored && <div className="space-y-3 py-3"><p role="status" className="text-sm">恢复了 {restored.documents} 份资料，跳过 {restored.skippedDocuments} 份重复文件。</p>{restored.reindexRequired && <Button disabled={!!busy} variant="outline" onClick={() => void reindex()}>{busy === "reindex" && <Loader2 size={16} className="animate-spin" />}Reindex restored knowledge</Button>}<Button variant="outline" asChild><Link href="/library?source=workspace">Open restored Library</Link></Button></div>}
      {!available && <p className="text-sm leading-7 text-muted-foreground">请先配置 FileMind 数据库存储，再导出或导入备份。</p>}
      {error && <p role="alert" className="text-sm leading-7 text-destructive">{error}</p>}
    </div>
  </section>;
}
