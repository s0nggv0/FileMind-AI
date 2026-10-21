"use client";

import { AlertCircle, Check, FileText, Network, Pause, RotateCcw, Sparkles, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { stateLabel, systemMessage, toolLabel } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";
import type { AgentRun, AgentStep } from "@/types/workspace";
import { useWorkspaceStore } from "../store/workspace-store";

function AgentStepItem({ step }: { step: AgentStep }) {
  const retry = useWorkspaceStore((state) => state.retry); const skip = useWorkspaceStore((state) => state.skip);
  const Icon = step.status === "completed" ? Check : step.status === "failed" ? AlertCircle : step.tool === "build_relationships" ? Network : step.tool === "generate_tags" ? Tags : FileText;
  return <li className={cn("flex gap-3 px-5 py-4 transition-colors", step.status === "running" && "bg-accent/50")}>
    <span className={cn("mt-1 flex size-7 shrink-0 items-center justify-center", step.status === "completed" || step.status === "running" ? "text-primary" : step.status === "failed" ? "text-destructive" : "text-muted-foreground")}><Icon size={18} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="break-all text-xs font-medium">{toolLabel(step.tool)}</span><span className="text-xs capitalize text-muted-foreground">{stateLabel(step.status)}{step.startedAt && step.completedAt && ` · ${step.completedAt - step.startedAt} ms`}</span></div><p className="mt-2 break-words text-sm">{systemMessage(step.description)}</p>{step.output && <p className="mt-1 text-xs text-muted-foreground">{systemMessage(step.output)}</p>}
      {step.status === "running" && <div className="mt-3 h-0.5 w-16 rounded-full bg-primary/30 motion-safe:animate-pulse" />}
      {step.status === "failed" && <div role="alert" className="mt-3"><p className="text-xs text-destructive">{step.error ? systemMessage(step.error) : "此步骤失败，请重试。"}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void retry(step.id)}><RotateCcw size={14} />重试此步骤</Button>{step.input.documentId && <Button size="sm" variant="ghost" onClick={() => void skip(step.id)}>跳过此文件</Button>}</div></div>}
    </div>
  </li>;
}
export function AgentActivityFeed({ run }: { run: AgentRun }) {
  return <aside className="min-w-0"><h2 className="text-sm font-semibold">执行动态</h2><p className="mt-2 text-xs text-muted-foreground">本次整理的操作记录。</p><ol aria-label="整理助手动态" className="mt-5 max-h-120 space-y-4 overflow-auto">{run.activity.map((event) => <li key={event.id} className="border-b border-border pb-4 motion-safe:animate-in motion-safe:fade-in"><time className="text-xs tabular-nums text-muted-foreground">{new Date(event.at).toLocaleTimeString("zh-CN", { hour12: false })}</time><p className="mt-1.5 break-words text-sm leading-6">{systemMessage(event.message)}</p></li>)}</ol><h3 className="mt-7 text-sm font-semibold">文件队列</h3><ul aria-label="文件解析状态" className="mt-3 max-h-64 divide-y divide-border overflow-auto">{run.documents.map((document) => <li key={document.id} className="flex items-center gap-2 py-3 text-xs"><span className="min-w-0 flex-1 truncate" title={document.name}>{document.name}</span><span className={cn("capitalize", document.parseStatus === "failed" ? "text-destructive" : "text-muted-foreground")}>{stateLabel(document.parseStatus)}</span></li>)}</ul></aside>;
}
export function AgentExecution({ run,competition=false }: { run: AgentRun;competition?:boolean }) {
  const { cancel, restart, reset, continueLocally, engineLabel } = useWorkspaceStore();
  const stopped = ["cancelled", "failed"].includes(run.status);
  const failedStep = run.steps.find((step) => step.status === "failed");
  const current = run.steps.find((step) => step.status === "running");
  const phase = run.status === "planning" ? "正在规划整理方案" : current?.tool === "read_document" ? "正在解析资料" : "正在分析";
  return <div className="space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><Sparkles size={23} className="text-primary" /><h2 className="text-xl font-medium">AI 整理助手</h2><Badge variant="outline">{engineLabel}</Badge></div>{!stopped && <Button variant="ghost" size="sm" onClick={cancel}><Pause size={14} />取消</Button>}</div>
    {stopped ? <section className="surface-secondary p-6" role="status"><h3 className="text-2xl font-medium">{run.interrupted ? "整理已中断" : run.status === "cancelled" ? "整理已停止" : "整理助手需要重新启动"}</h3><p className="mt-3 text-sm text-muted-foreground">文件未被修改。</p>{run.error && <p className="mt-3 text-sm text-destructive">{systemMessage(run.error)}</p>}<div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => void restart()}><RotateCcw size={15} />{run.interrupted ? "继续分析" : "重新启动"}</Button>{!competition&&<Button variant="outline" onClick={() => void continueLocally()}>使用本地规则继续整理</Button>}{competition&&<p role="status" className="text-sm text-muted-foreground">云端 AI 服务不可用，已保存资料和本地检索仍可使用。</p>}<Button variant="outline" onClick={reset}>新建工作区</Button></div></section> : <section className="surface-secondary px-6 py-5" aria-live="polite">
      <div className="flex items-start justify-between gap-5"><div><h3 className="text-xl font-medium">{failedStep ? "需要你处理" : phase}</h3><p className="mt-2 text-sm text-muted-foreground">{failedStep ? "重试失败步骤，或跳过该文件后继续。" : run.status === "planning" ? "正在分析工作区并制定整理方案。" : (current?.description ? systemMessage(current.description) : undefined) ?? "正在准备下一步"}</p></div><span className="text-3xl font-medium tabular-nums">{run.progress}<span className="ml-0.5 text-base text-muted-foreground">%</span></span></div>
      <div role="progressbar" aria-label="整理进度" aria-valuenow={run.progress} aria-valuemin={0} aria-valuemax={100} className="mt-5 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${run.progress}%` }} /></div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"><span>资料： {run.documents.length}</span><span>{run.status === "planning" ? `计划操作： ${run.documents.length + 6}` : `${run.steps.filter((step) => ["completed", "skipped"].includes(step.status)).length} / ${run.steps.length} 项任务已完成`}</span></div>
    </section>}
    <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">查看详细执行步骤与日志</summary><div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_280px]"><section className="min-w-0"><h3 className="mb-4 text-sm font-semibold">{run.status === "planning" ? "正在准备执行方案" : "工具执行"}</h3>{run.steps.length ? <ol aria-label="整理工具" className="divide-y divide-border overflow-hidden rounded-xl border bg-card">{run.steps.map((step) => <AgentStepItem key={step.id} step={step} />)}</ol> : <p className="py-8 text-sm text-muted-foreground">正在读取文件队列并选择工具…</p>}</section><AgentActivityFeed run={run} /></div></details>
  </div>;
}
