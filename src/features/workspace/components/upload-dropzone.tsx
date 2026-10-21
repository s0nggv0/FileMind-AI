"use client";

import { useRef, useState } from "react";
import { FileText, FolderOpen, Image, GraduationCap, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadAccept, uploadConfig } from "@/config/upload";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "../store/workspace-store";

export function UploadDropzone() {
  const input = useRef<HTMLInputElement>(null); const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const addFiles = useWorkspaceStore((state) => state.addFiles);
  return <section>
    <div onDragEnter={(event) => { event.preventDefault(); depth.current++; setDragging(true); }} onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { event.preventDefault(); if (--depth.current <= 0) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); depth.current = 0; setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}
      className={cn("flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-5 py-10 text-center transition-colors sm:min-h-96", dragging ? "border-primary bg-accent" : "border-border")}>
      <Upload size={30} strokeWidth={1.4} className="mb-6 text-primary" aria-hidden="true" />
      <h2 className="text-2xl font-medium sm:text-3xl">在这里导入文件</h2>
      <p className="mt-3 text-sm text-muted-foreground">导入论文、笔记和项目资料，开始整理。</p>
      <div className="mt-6 flex items-center gap-4"><span className="text-sm text-muted-foreground">或</span><Button onClick={() => input.current?.click()}><Plus size={16} />选择文件</Button></div>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label="选择本地文件" multiple accept={uploadAccept} onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <p className="mt-6 text-xs leading-6 text-muted-foreground">PDF · DOCX · Markdown · TXT · 图片<br />每份文件最多 {uploadConfig.maxFileBytes / 1024 / 1024}  MB · {uploadConfig.maxFiles} 份文件，每个工作区</p>
    </div>
    <p className="mt-3 text-xs leading-6 text-muted-foreground">扫描 PDF 暂不自动逐页识别。可选中文字的 PDF、Word 和文字资料可提取正文；图片单独提取文字与 AI 解读。<a className="inline-flex min-h-11 items-center text-primary underline" href="/settings#services">查看处理与云服务说明</a></p>
    <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground">{[[FileText, "研究论文"], [GraduationCap, "课程笔记"], [FolderOpen, "项目资料"], [Image, "截图"]].map(([Icon, label]) => { const Component = Icon as typeof FileText; return <span key={label as string} className="flex items-center gap-2"><Component size={15} aria-hidden="true" />{label as string}</span>; })}</div>
  </section>;
}
