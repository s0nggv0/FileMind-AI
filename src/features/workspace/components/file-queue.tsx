"use client";

import { AlertCircle, ArrowRight, X } from "lucide-react";
import { DocumentTypeIcon } from "@/components/common/document-type-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFileSize } from "@/config/upload";
import { useWorkspaceStore } from "../store/workspace-store";
import type { DemoFault } from "@/types/workspace";

export function FileQueue({demoMode=false}:{demoMode?:boolean}) {
  const { documents, errors, removeFile, clearFiles, start, fault, setFault } = useWorkspaceStore();
  return <div className="space-y-6">
    {errors.length > 0 && <div role="alert" className="flex gap-3 rounded-lg bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle size={18} className="shrink-0" /><div>{errors.map((error, index) => <p key={`${index}-${error}`} className="break-words">{error}</p>)}</div></div>}
    {documents.length > 0 && <section>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">文件队列 <span className="ml-2 font-normal text-muted-foreground">{documents.length} 份文件</span></h2><Button size="sm" variant="ghost" onClick={clearFiles}>清空列表</Button></div>
      <div className="max-h-80 divide-y divide-border overflow-auto rounded-xl border border-border bg-card">{documents.map((document) => <div key={document.id} className="flex items-center gap-3 px-4 py-3">
        <DocumentTypeIcon type={document.type} /><div className="min-w-0 flex-1"><p className="truncate text-sm" title={document.name}>{document.name}</p><p className="mt-1 text-xs text-muted-foreground">{document.type.toUpperCase()} · {formatFileSize(document.size)}{documents.filter((item) => item.name.toLowerCase() === document.name.toLowerCase()).length > 1 && <span className="ml-2 text-primary">重复候选</span>}</p></div><Badge variant="secondary">已就绪</Badge><Button size="icon" variant="ghost" aria-label={`移除 ${document.name}`} onClick={() => removeFile(document.id)}><X size={16} /></Button>
      </div>)}</div>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">FileMind 准备方案，由你审阅决定。</p><Button onClick={() => void start()}>开始整理 <ArrowRight size={16} /></Button></div>
      {!demoMode&&<details className="mt-7 text-xs text-muted-foreground"><summary className="cursor-pointer py-2">演示控制 · 测试故障恢复</summary><label className="mt-3 flex flex-wrap items-center gap-3">模拟一次故障<select aria-label="模拟故障" value={fault} onChange={(event) => setFault(event.target.value as DemoFault)} className="min-h-11 rounded-lg border bg-card px-3 text-foreground"><option value="none">不模拟故障</option><option value="parse">解析失败 · 首份资料</option><option value="tool">工具失败 · 生成标签</option><option value="agent">助手失败 · 执行前</option></select></label><p className="mt-2">故障只模拟一次，重试或重新启动即可恢复。</p></details>}
    </section>}
  </div>;
}
