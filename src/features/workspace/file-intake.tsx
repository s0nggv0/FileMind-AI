"use client";

import { useRef, useState, type DragEvent } from "react";
import { AlertCircle, ArrowUpRight, FileText, FolderOpen, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DemoDocument, DemoWorkspaceStep } from "@/types";

type SelectedFile = { id: string; file: File };
const acceptedExtensions = new Set(["pdf", "docx", "md", "txt", "png", "jpg", "jpeg"]);
const megabyte = 1024 * 1024;

function formatSize(bytes: number) {
  return bytes >= megabyte ? `${(bytes / megabyte).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FileIntake({ documents, steps }: { documents: DemoDocument[]; steps: DemoWorkspaceStep[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function addFiles(files: File[]) {
    const next = [...selected];
    const warnings: string[] = [];
    for (const file of files) {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      if (!acceptedExtensions.has(extension)) { warnings.push(`${file.name}：暂不支持此文件格式。`); continue; }
      if (file.size > 20 * megabyte) { warnings.push(`${file.name}：单个文件不能超过 20 MB。`); continue; }
      if (next.some((item) => item.id === id)) { warnings.push(`${file.name}：已经在选择列表中。`); continue; }
      if (next.length >= 50) { warnings.push("每批最多选择 50 个文件。"); break; }
      if (next.reduce((total, item) => total + item.file.size, 0) + file.size > 200 * megabyte) { warnings.push(`${file.name}：本批文件总量不能超过 200 MB。`); continue; }
      next.push({ id, file });
    }
    setSelected(next);
    setErrors([...new Set(warnings)]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">导入资料</h2><span className="text-xs text-muted-foreground">01 / 选择文件</span></div>
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
          onDrop={onDrop}
          className={cn("flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center transition-colors sm:min-h-80", dragging && "border-primary bg-primary/5")}
        >
          <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-border bg-background"><Upload size={23} strokeWidth={1.5} className="text-primary" /></span>
          <h3 className="text-lg font-medium">把零散的资料，放在这里</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">拖放文件，或从本机选择。此阶段仅预览文件信息，文件不会被上传。</p>
          <input ref={inputRef} type="file" className="sr-only" tabIndex={-1} aria-label="选择本地资料" multiple accept=".pdf,.docx,.md,.txt,.png,.jpg,.jpeg" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          <Button className="mt-6" onClick={() => inputRef.current?.click()}><Plus size={16} /> 选择文件</Button>
          <p className="mt-5 text-xs leading-6 text-muted-foreground">PDF · DOCX · Markdown · TXT · 图片<br />单文件 ≤ 20 MB · 每批 ≤ 50 个 / 200 MB</p>
        </div>
        {errors.length > 0 && <div role="alert" className="mt-4 flex gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div className="space-y-1">{errors.map((error) => <p key={error}>{error}</p>)}</div></div>}
        {selected.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs text-muted-foreground">已选择 {selected.length} 个本地文件 · {formatSize(selected.reduce((total, item) => total + item.file.size, 0))}</p><Button size="sm" variant="ghost" onClick={() => { setSelected([]); setErrors([]); }}>清空</Button></div>
            <div className="max-h-64 divide-y divide-border overflow-auto rounded-xl border border-border">
              {selected.map(({ id, file }) => <div key={id} className="flex items-center gap-3 px-4 py-3"><FileText size={17} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm">{file.name}</span><span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span><Button variant="ghost" size="icon" className="min-h-11 min-w-11 sm:size-8 sm:min-h-8 sm:min-w-8" aria-label={`移除 ${file.name}`} onClick={() => setSelected((items) => items.filter((item) => item.id !== id))}><X size={14} /></Button></div>)}
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-col items-start justify-between gap-4 rounded-xl bg-muted/50 px-5 py-4 sm:flex-row sm:items-center"><div><p className="text-sm font-medium">你负责决定，Agent 负责整理。</p><p className="mt-1 text-xs text-muted-foreground">真实解析与分析将在后续阶段接入；当前没有运行中的任务。</p></div><Button disabled className="shrink-0">开始分析 <ArrowUpRight size={16} /></Button></div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Agent 工作流</h2><Badge variant="outline">流程预览</Badge></div>
        <div className="grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => <div key={step.id} className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><div><p className="text-sm font-medium">{step.label}</p><p className="mt-1.5 font-mono text-[10px] text-muted-foreground">{step.tool}</p></div></div>)}
        </div>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">Phase 3 扩展工作台交互；真实工具与进度将在 Phase 7 的 Agent 功能中接入。整理结果需审阅后才能执行。</p>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2"><h2 className="text-sm font-semibold">示例收件箱</h2><Badge variant="secondary">演示数据</Badge></div>
        <div className="divide-y divide-border">
          {documents.slice(0, 3).map((document) => <div key={document.id} className="flex items-center gap-3 py-4"><FolderOpen size={18} className="shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm">{document.name}</p><p className="mt-1 text-xs text-muted-foreground">{document.summary}</p></div><Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{document.category}</Badge></div>)}
        </div>
      </section>
    </div>
  );
}
