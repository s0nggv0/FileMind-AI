"use client";

import { AlertCircle, ArrowRight, X } from "lucide-react";
import { DocumentTypeIcon } from "@/components/common/document-type-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFileSize } from "@/config/upload";
import { useWorkspaceStore } from "../store/workspace-store";
import type { DemoFault } from "@/types/workspace";

export function FileQueue() {
  const { documents, errors, removeFile, clearFiles, start, fault, setFault } = useWorkspaceStore();
  return <div className="space-y-6">
    {errors.length > 0 && <div role="alert" className="flex gap-3 rounded-lg bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle size={18} className="shrink-0" /><div>{errors.map((error, index) => <p key={`${index}-${error}`} className="break-words">{error}</p>)}</div></div>}
    {documents.length > 0 && <section>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">File queue <span className="ml-2 font-normal text-muted-foreground">{documents.length} files</span></h2><Button size="sm" variant="ghost" onClick={clearFiles}>Clear all</Button></div>
      <div className="max-h-80 divide-y divide-border overflow-auto rounded-xl border border-border bg-card">{documents.map((document) => <div key={document.id} className="flex items-center gap-3 px-4 py-3">
        <DocumentTypeIcon type={document.type} /><div className="min-w-0 flex-1"><p className="truncate text-sm" title={document.name}>{document.name}</p><p className="mt-1 text-xs text-muted-foreground">{document.type.toUpperCase()} · {formatFileSize(document.size)}{documents.filter((item) => item.name.toLowerCase() === document.name.toLowerCase()).length > 1 && <span className="ml-2 text-primary">Possible duplicate</span>}</p></div><Badge variant="secondary">Ready</Badge><Button size="icon" variant="ghost" aria-label={`Remove ${document.name}`} onClick={() => removeFile(document.id)}><X size={16} /></Button>
      </div>)}</div>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">You decide. FileMind prepares the plan.</p><Button onClick={() => void start()}>Organize with FileMind <ArrowRight size={16} /></Button></div>
      <details className="mt-7 text-xs text-muted-foreground"><summary className="cursor-pointer py-2">Demo controls · test error recovery</summary><label className="mt-3 flex flex-wrap items-center gap-3">Inject one failure<select aria-label="Demo failure" value={fault} onChange={(event) => setFault(event.target.value as DemoFault)} className="min-h-11 rounded-lg border bg-card px-3 text-foreground"><option value="none">No failure</option><option value="parse">Parse Error · first document</option><option value="tool">Tool Error · generate_tags</option><option value="agent">Agent Error · before execution</option></select></label><p className="mt-2">A simulated failure happens once. Retry or restart recovers.</p></details>
    </section>}
  </div>;
}
