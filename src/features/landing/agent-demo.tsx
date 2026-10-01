"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { Check, Circle, Orbit, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentTypeIcon } from "@/components/common/document-type-icon";
import { cn } from "@/lib/utils";
import type { AgentStage, LandingFile } from "@/types/presentation";

type AgentDemoProps = {
  stages: AgentStage[];
  files: LandingFile[];
  metrics: { files: number; categories: number; connections: number; similarFiles: number };
};

export function AgentDemo({ stages, files, metrics }: AgentDemoProps) {
  const container = useRef<HTMLDivElement>(null);
  const inView = useInView(container, { amount: 0.25 });
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = reducedMotion ? stages.length - 1 : step;
  const complete = current === stages.length - 1;

  useEffect(() => {
    if (reducedMotion || paused || !inView || step >= stages.length - 1) return;
    const timer = window.setTimeout(() => setStep((value) => value + 1), 1500);
    return () => window.clearTimeout(timer);
  }, [step, stages.length, paused, reducedMotion, inView]);

  const totals = [
    { label: "Files", value: metrics.files },
    { label: "Categories", value: metrics.categories },
    { label: "Connections", value: metrics.connections },
    { label: "Similar Files", value: metrics.similarFiles },
  ];

  return (
    <div ref={container} className="surface-primary overflow-hidden" data-testid="agent-demo" data-step={current}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3"><Orbit size={20} className="text-primary" /><span className="text-sm font-medium">FileMind Agent</span><span className="rounded-interactive bg-muted px-2 py-1 text-[11px] text-muted-foreground">前端演示</span></div>
        <div className="flex items-center gap-1">
          {!reducedMotion && !complete && <Button variant="ghost" size="sm" onClick={() => setPaused(!paused)} aria-label={paused ? "继续演示" : "暂停演示"}>{paused ? <Play /> : <Pause />}<span className="hidden sm:inline">{paused ? "Resume" : "Pause"}</span></Button>}
          {!reducedMotion && <Button variant="ghost" size="sm" onClick={() => { setStep(0); setPaused(false); }} aria-label="重播演示"><RotateCcw /><span className="hidden sm:inline">Replay</span></Button>}
          {reducedMotion && <span className="text-xs text-muted-foreground">减少动态效果 · 静态预览</span>}
        </div>
      </div>
      <div className="grid md:grid-cols-[1fr_1.2fr]">
        <div className="border-b bg-surface-secondary/40 p-5 sm:p-7 md:border-b-0 md:border-r">
          <div className="mb-4 flex justify-between text-xs text-muted-foreground"><span>Your documents</span><span className="font-mono">{current > 0 ? `${metrics.files} files added` : "Ready to begin"}</span></div>
          <div className="space-y-1">
            {files.slice(0, 4).map((file, index) => (
              <motion.div key={file.name} layout={!reducedMotion} className="flex min-w-0 items-center gap-3 border-b border-border/60 py-3 last:border-0" animate={{ opacity: current === 0 ? 0.45 : 1, x: current > 0 && !reducedMotion ? 0 : 4 }} transition={{ duration: 0.2, delay: reducedMotion ? 0 : index * 0.06 }}>
                <DocumentTypeIcon type={file.type} />
                <div className="min-w-0 flex-1"><p className="truncate text-xs sm:text-sm">{file.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{current >= 3 ? file.category : file.type.toUpperCase()}</p></div>
                {current >= 3 && <Check size={14} className="shrink-0 text-primary" />}
              </motion.div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{current === 0 ? "Drop your files. Leave the understanding to FileMind." : `+ ${files.length - 4} more documents in this sample`}</p>
        </div>
        <div className="flex flex-col justify-between p-5 sm:p-7">
          <div className="flex items-center gap-2 text-xs text-primary"><span className="size-1.5 rounded-full bg-primary" />{complete ? "Ready to explore" : paused ? "Playback paused" : "Agent walkthrough"}</div>
          <div className="my-6 min-h-24">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={current} initial={{ opacity: 1, y: reducedMotion ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: reducedMotion ? 1 : 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }}>
                <p className="text-2xl font-medium tracking-tight" aria-live="polite">{stages[current].label}</p>
                <p className="mt-3 text-sm text-muted-foreground">{stages[current].detail}</p>
                <p className="mt-4 flex items-center gap-2 font-mono text-[11px] text-primary">{complete ? <Check size={13} /> : <Circle size={10} />}{stages[current].activity}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <ol className="flex gap-1.5" aria-label="演示进度">
            {stages.map((stage, index) => <li key={stage.label} className={cn("h-1 flex-1 rounded-full transition-colors", index <= current ? "bg-primary" : "bg-border")}><span className="sr-only">{stage.label}{index === current ? "：当前步骤" : ""}</span></li>)}
          </ol>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-y-5 border-t px-5 py-5 sm:grid-cols-4 sm:px-7">
        {totals.map((item) => <div key={item.label} className="flex items-baseline gap-2"><span className="font-mono text-xl tabular-nums">{complete ? item.value : "—"}</span><span className="text-xs text-muted-foreground">{item.label}</span></div>)}
      </div>
      <p className="border-t bg-muted/30 px-5 py-3 text-[11px] leading-5 text-muted-foreground sm:px-7">交互演示 · 使用预设文件与流程，没有读取本地文件或调用 AI。实际 Agent 与 RAG 将在后续阶段接入。</p>
    </div>
  );
}
