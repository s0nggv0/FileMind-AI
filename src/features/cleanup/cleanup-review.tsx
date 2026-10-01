"use client";

import { useState } from "react";
import { ArrowRight, Copy, FileText, History, ShieldCheck, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { cn } from "@/lib/utils";
import type { CleanupIssueType, DemoCleanupIssue } from "@/types";

const issuePresentation = {
  duplicate: { label: "内容重叠", icon: Copy },
  outdated: { label: "信息更新", icon: History },
  "missing-tags": { label: "标签建议", icon: Tags },
} satisfies Record<CleanupIssueType, { label: string; icon: typeof Copy }>;

function SuggestionItem({ issue, active, onSelect }: { issue: DemoCleanupIssue; active: boolean; onSelect: () => void }) {
  const { icon: Icon, label } = issuePresentation[issue.type];
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className={cn("flex w-full gap-3 rounded-xl border p-4 text-left transition-colors", active ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/50")}
    >
      <Icon size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{issue.title}</p>
        <p className="mt-2 text-xs text-muted-foreground">{label} · 涉及 {issue.files.length} 份资料</p>
      </div>
      <ArrowRight size={14} className="mt-1 shrink-0 text-muted-foreground" />
    </button>
  );
}

function SuggestionDetail({ issue }: { issue: DemoCleanupIssue }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-live="polite">
      <div className="flex items-center justify-between">
        <Badge variant="outline">{issuePresentation[issue.type].label}</Badge>
        <span className="text-[11px] text-muted-foreground">建议预览</span>
      </div>
      <h2 className="mt-5 text-xl font-medium tracking-tight">{issue.title}</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{issue.description}</p>
      <div className="mt-6">
        <p className="mb-3 text-xs font-medium">涉及的资料</p>
        <div className="divide-y divide-border rounded-lg bg-muted/50 px-4">
          {issue.files.map((file) => (
            <div key={file} className="flex items-center gap-2 py-3 text-xs">
              <FileText size={15} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{file}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6">
        <p className="mb-3 text-xs font-medium">差异预览 · {issue.preview.label}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <p className="text-[11px] text-muted-foreground">当前示例</p>
            <p className="mt-2 text-xs leading-6">{issue.preview.before}</p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-[11px] text-primary">建议变化</p>
            <p className="mt-2 text-xs leading-6">{issue.preview.after}</p>
          </div>
        </div>
      </div>
      <p className="mt-5 text-sm leading-7 text-muted-foreground">{issue.recommendation}</p>
      <div className="mt-6 flex flex-col items-start gap-3 border-t border-border pt-5">
        <Button disabled size="sm">确认并应用</Button>
        <p className="text-xs leading-6 text-muted-foreground">执行与恢复将在整理功能阶段接入。此处建议并非真实检测结果。</p>
      </div>
    </section>
  );
}

export function CleanupReview({ issues }: { issues: DemoCleanupIssue[] }) {
  const [selectedId, setSelectedId] = useState(issues[0]?.id);
  const selected = issues.find((issue) => issue.id === selectedId);
  return (
    <div className="space-y-7">
      <div className="flex gap-3 rounded-xl bg-primary/5 px-5 py-4">
        <ShieldCheck size={19} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">整理之前，先看清变化。</p>
          <p className="mt-1.5 text-xs leading-6 text-muted-foreground">所有建议都需要你的确认。此阶段只展示审阅结构，不会删除、重命名或修改任何资料。</p>
        </div>
      </div>
      {!selected ? (
        <EmptyState icon={ShieldCheck} title="暂时没有整理建议" description="新的整理建议将在分析资料后出现。" />
      ) : (
        <div className="grid gap-7 lg:grid-cols-[minmax(240px,.85fr)_minmax(0,1.5fr)]">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">待审阅的示例建议</h2>
              <Badge variant="secondary">{issues.length}</Badge>
            </div>
            <div className="space-y-2">
              {issues.map((issue) => <SuggestionItem key={issue.id} issue={issue} active={selectedId === issue.id} onSelect={() => setSelectedId(issue.id)} />)}
            </div>
          </section>
          <SuggestionDetail issue={selected} />
        </div>
      )}
    </div>
  );
}
