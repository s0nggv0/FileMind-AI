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

export function Workspace() {
  const run = useWorkspaceStore((state) => state.run); const proposal = useWorkspaceStore((state) => state.proposal);
  const focus = useRef<HTMLDivElement>(null);
  const stage = !run ? 0 : ["waiting_for_review", "applying", "completed"].includes(run.status) ? 2 : 1;
  useEffect(() => { focus.current?.focus({ preventScroll: true }); }, [stage]);
  return <div className="space-y-7">
    <nav aria-label="Workspace stages" className="flex flex-wrap gap-5 border-b pb-4">{["Upload", "Agent Execution", "Review & Apply"].map((label, index) => <span key={label} aria-current={stage === index ? "step" : undefined} className={cn("flex items-center gap-2 text-xs", stage === index ? "font-medium text-primary" : "text-muted-foreground")}><span className={cn("flex size-6 items-center justify-center rounded-full tabular-nums", stage === index ? "bg-accent" : "bg-muted")}>{index + 1}</span>{label}</span>)}</nav>
    <div ref={focus} tabIndex={-1} className="outline-none">
      {!run && <div className="space-y-6"><UploadDropzone /><FileQueue /></div>}
      {run && stage === 1 && <AgentExecution run={run} />}
      {run?.status === "waiting_for_review" && proposal && <OrganizationReview plan={proposal} />}
      {run?.status === "applying" && <section className="surface-secondary p-8" role="status"><h2 className="text-2xl font-medium">Applying your plan…</h2><p className="mt-3 text-sm text-muted-foreground">Updating categories, accepted names and connections inside FileMind.</p></section>}
      {run?.status === "completed" && run.result && <CompletionState plan={run.result} />}
    </div>
    <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground"><LockKeyhole size={14} className="mt-1 shrink-0" />No file is uploaded to a remote server in this phase. Files are parsed in your browser; Agent reasoning is simulated.</p>
  </div>;
}
