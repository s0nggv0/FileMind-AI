"use client";

import { useEffect, useRef } from "react";
import { LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "./store/workspace-store";
import { UploadDropzone } from "./components/upload-dropzone";
import { FileQueue } from "./components/file-queue";
import { AgentExecution } from "./components/agent-execution";
import { OrganizationReview } from "./components/organization-review";
import { CompletionState } from "./components/completion-state";

export function Workspace({ workspaceId,demoMode=false,competition=false }: { workspaceId?: string;demoMode?:boolean;competition?:boolean }) {
  const run = useWorkspaceStore((state) => state.run); const proposal = useWorkspaceStore((state) => state.proposal);
  const focus = useRef<HTMLDivElement>(null);
  const { initialize, initialized, persistent, engineLabel, saveStatus, errors } = useWorkspaceStore();
  useEffect(() => { void initialize(workspaceId); }, [initialize, workspaceId]);
  const stage = !run ? 0 : ["waiting_for_review", "applying", "completed"].includes(run.status) ? 2 : 1;
  useEffect(() => { focus.current?.focus({ preventScroll: true }); }, [stage]);
  return <div className="space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{engineLabel} · {persistent ? "可保存工作区" : "仅本地演示"}</span><span role="status" aria-live="polite">{!initialized ? "正在加载工作区…" : saveStatus === "saving" ? "正在保存…" : saveStatus === "saved" ? "已保存" : saveStatus === "error" ? "保存失败 · 请重试操作或刷新页面" : "仅当前会话"}</span></div>
    {run && errors.length > 0 && <p role="alert" className="text-sm text-destructive">{errors.join(" ")}</p>}
    <nav aria-label="工作区步骤" className="flex flex-wrap gap-5 border-b pb-4">{["导入文件", "助手执行", "审阅与应用"].map((label, index) => <span key={label} aria-current={stage === index ? "step" : undefined} className={cn("flex items-center gap-2 text-xs", stage === index ? "font-medium text-primary" : "text-muted-foreground")}><span className={cn("flex size-6 items-center justify-center rounded-full tabular-nums", stage === index ? "bg-accent" : "bg-muted")}>{index + 1}</span>{label}</span>)}</nav>
    <div ref={focus} tabIndex={-1} className="outline-none">
      {initialized && !run && <div className="space-y-6"><UploadDropzone /><FileQueue demoMode={demoMode} /></div>}
      {run && stage === 1 && <AgentExecution run={run} competition={competition} />}
      {run?.status === "waiting_for_review" && proposal && <OrganizationReview plan={proposal} />}
      {run?.status === "applying" && <section className="surface-secondary p-8" role="status"><h2 className="text-2xl font-medium">正在应用方案…</h2><p className="mt-3 text-sm text-muted-foreground">正在更新 FileMind 中的分类、已接受名称和关联。</p></section>}
      {run?.status === "completed" && run.result && <CompletionState plan={run.result} />}
    </div>
    <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground"><LockKeyhole size={14} className="mt-1 shrink-0" />{persistent ? "文件保存在私有工作区中，正文在本地解析。使用 AI 模式时，提取的正文会发送到服务端 AI 服务。" : "仅本地演示：文件保留在浏览器中，按本地规则整理；刷新会清空当前会话。"}</p>
  </div>;
}
