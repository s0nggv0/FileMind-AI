import Link from "next/link";
import { ArrowUpRight, Files, GitBranch, ListChecks, Sparkles, Sprout } from "lucide-react";
import type { DashboardInsight } from "@/types/presentation";
import { EmptyState } from "@/components/feedback/empty-state";

const insightIcons = { growth: Sprout, overlap: Files, connection: GitBranch, review: ListChecks };

export function AIInsights({ insights }: { insights: DashboardInsight[] }) {
  return (
    <section className="surface-primary p-5 sm:p-6" aria-labelledby="ai-insights-heading">
      <div className="mb-6 flex items-center justify-between gap-3"><h2 id="ai-insights-heading" className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-primary" /> AI Insight</h2><span className="text-[11px] text-muted-foreground">Sample insights</span></div>
      {insights.length ? <div className="grid gap-6 md:grid-cols-2">
        {insights.map((insight) => {
          const Icon = insightIcons[insight.kind];
          return <article key={insight.id} className="flex min-w-0 items-start gap-3"><Icon size={17} strokeWidth={1.5} className="mt-0.5 shrink-0 text-primary" /><div className="min-w-0"><h3 className="text-sm font-medium leading-6">{insight.title}</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">{insight.description}</p><Link href={insight.href} aria-label={`Review：${insight.title}`} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs text-primary hover:underline">Review <ArrowUpRight size={13} /></Link></div></article>;
        })}
      </div> : <EmptyState title="暂时没有新的发现" description="你的资料状态良好。添加资料后，可以在这里继续审阅新的建议。" />}
    </section>
  );
}
