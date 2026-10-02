"use client";

import { AlertCircle, Check, FileText, Network, Pause, RotateCcw, Sparkles, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentRun, AgentStep } from "@/types/workspace";
import { useWorkspaceStore } from "../store/workspace-store";

function AgentStepItem({ step }: { step: AgentStep }) {
  const retry = useWorkspaceStore((state) => state.retry); const skip = useWorkspaceStore((state) => state.skip);
  const Icon = step.status === "completed" ? Check : step.status === "failed" ? AlertCircle : step.tool === "build_relationships" ? Network : step.tool === "generate_tags" ? Tags : FileText;
  return <li className={cn("flex gap-3 px-5 py-4 transition-colors", step.status === "running" && "bg-accent/50")}>
    <span className={cn("mt-1 flex size-7 shrink-0 items-center justify-center", step.status === "completed" || step.status === "running" ? "text-primary" : step.status === "failed" ? "text-destructive" : "text-muted-foreground")}><Icon size={18} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><code className="break-all text-xs font-medium">{step.tool}()</code><span className="text-xs capitalize text-muted-foreground">{step.status}{step.startedAt && step.completedAt && ` · ${step.completedAt - step.startedAt} ms`}</span></div><p className="mt-2 break-words text-sm">{step.description}</p>{step.output && <p className="mt-1 text-xs text-muted-foreground">{step.output}</p>}
      {step.status === "running" && <div className="mt-3 h-0.5 w-16 rounded-full bg-primary/30 motion-safe:animate-pulse" />}
      {step.status === "failed" && <div role="alert" className="mt-3"><p className="text-xs text-destructive">{step.error}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void retry(step.id)}><RotateCcw size={14} />Retry step</Button>{step.input.documentId && <Button size="sm" variant="ghost" onClick={() => void skip(step.id)}>Skip document</Button>}</div></div>}
    </div>
  </li>;
}
export function AgentActivityFeed({ run }: { run: AgentRun }) {
  return <aside className="min-w-0"><h2 className="text-sm font-semibold">Activity</h2><p className="mt-2 text-xs text-muted-foreground">A record of every action in this run.</p><ol aria-label="Agent activity" className="mt-5 max-h-120 space-y-4 overflow-auto">{run.activity.map((event) => <li key={event.id} className="border-b border-border pb-4 motion-safe:animate-in motion-safe:fade-in"><time className="text-xs tabular-nums text-muted-foreground">{new Date(event.at).toLocaleTimeString("en-GB", { hour12: false })}</time><p className="mt-1.5 break-words text-sm leading-6">{event.message}</p></li>)}</ol><h3 className="mt-7 text-sm font-semibold">File queue</h3><ul aria-label="File parse status" className="mt-3 max-h-64 divide-y divide-border overflow-auto">{run.documents.map((document) => <li key={document.id} className="flex items-center gap-2 py-3 text-xs"><span className="min-w-0 flex-1 truncate" title={document.name}>{document.name}</span><span className={cn("capitalize", document.parseStatus === "failed" ? "text-destructive" : "text-muted-foreground")}>{document.parseStatus}</span></li>)}</ul></aside>;
}
export function AgentExecution({ run }: { run: AgentRun }) {
  const { cancel, restart, reset } = useWorkspaceStore();
  const stopped = ["cancelled", "failed"].includes(run.status);
  const failedStep = run.steps.find((step) => step.status === "failed");
  const current = run.steps.find((step) => step.status === "running");
  const phase = run.status === "planning" ? "Planning workspace" : current?.tool === "read_document" ? "Parsing documents" : "Analyzing";
  return <div className="space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><Sparkles size={23} className="text-primary" /><h2 className="text-xl font-medium">FileMind Agent</h2><Badge variant="outline">Agent Demo</Badge></div>{!stopped && <Button variant="ghost" size="sm" onClick={cancel}><Pause size={14} />Cancel</Button>}</div>
    {stopped ? <section className="surface-secondary p-6" role="status"><h3 className="text-2xl font-medium">{run.status === "cancelled" ? "Organization stopped" : "Agent needs a restart"}</h3><p className="mt-3 text-sm text-muted-foreground">Your files were not changed.</p>{run.error && <p className="mt-3 text-sm text-destructive">{run.error}</p>}<div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => void restart()}><RotateCcw size={15} />Restart</Button><Button variant="outline" onClick={reset}>Start another workspace</Button></div></section> : <section className="surface-secondary px-6 py-5" aria-live="polite">
      <div className="flex items-start justify-between gap-5"><div><h3 className="text-xl font-medium">{failedStep ? "Your attention is needed" : phase}</h3><p className="mt-2 text-sm text-muted-foreground">{failedStep ? "Retry the failed tool or skip the document to continue." : run.status === "planning" ? "Analyzing your workspace… building an action plan." : current?.description ?? "Preparing the next action"}</p></div><span className="text-3xl font-medium tabular-nums">{run.progress}<span className="ml-0.5 text-base text-muted-foreground">%</span></span></div>
      <div role="progressbar" aria-label="Agent progress" aria-valuenow={run.progress} aria-valuemin={0} aria-valuemax={100} className="mt-5 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${run.progress}%` }} /></div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"><span>Documents: {run.documents.length}</span><span>{run.status === "planning" ? `Planned actions: ${run.documents.length + 6}` : `${run.steps.filter((step) => ["completed", "skipped"].includes(step.status)).length} / ${run.steps.length} tasks completed`}</span><span>Tools available: 7</span></div>
    </section>}
    <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_280px]"><section className="min-w-0"><h3 className="mb-4 text-sm font-semibold">{run.status === "planning" ? "Preparing the execution plan" : "Tool execution"}</h3>{run.steps.length ? <ol aria-label="Agent tools" className="divide-y divide-border overflow-hidden rounded-xl border bg-card">{run.steps.map((step) => <AgentStepItem key={step.id} step={step} />)}</ol> : <p className="py-8 text-sm text-muted-foreground">Reading the file queue and selecting tools…</p>}</section><AgentActivityFeed run={run} /></div>
  </div>;
}
