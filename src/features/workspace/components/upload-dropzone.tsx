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
      <h2 className="text-2xl font-medium sm:text-3xl">Drop your files here</h2>
      <p className="mt-3 text-sm text-muted-foreground">Give your research, notes and ideas a place to belong.</p>
      <div className="mt-6 flex items-center gap-4"><span className="text-sm text-muted-foreground">or</span><Button onClick={() => input.current?.click()}><Plus size={16} />Choose files</Button></div>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label="Choose local files" multiple accept={uploadAccept} onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <p className="mt-6 text-xs leading-6 text-muted-foreground">PDF · DOCX · Markdown · TXT · Images<br />Max {uploadConfig.maxFileBytes / 1024 / 1024} MB per file · {uploadConfig.maxFiles} files per workspace</p>
    </div>
    <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground">{[[FileText, "Research papers"], [GraduationCap, "Course notes"], [FolderOpen, "Project documents"], [Image, "Screenshots"]].map(([Icon, label]) => { const Component = Icon as typeof FileText; return <span key={label as string} className="flex items-center gap-2"><Component size={15} aria-hidden="true" />{label as string}</span>; })}</div>
  </section>;
}
