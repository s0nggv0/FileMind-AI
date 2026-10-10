import type { OverviewMetrics } from "@/types";

export function KnowledgeOverview({ metrics, topicCount }: { metrics: OverviewMetrics; topicCount: number }) {
  const items = [
    { label: "资料", value: metrics.fileCount, description: "你的示例资料" },
    { label: "主题", value: topicCount, description: "主要知识主题" },
    { label: "关联", value: metrics.relationCount, description: "文档与概念关联" },
    { label: "待处理", value: metrics.pendingCount, description: "等待审阅的建议" },
  ];
  return (
    <section aria-labelledby="knowledge-overview-heading">
      <h2 id="knowledge-overview-heading" className="mb-4 text-sm font-semibold">资料概览</h2>
      <dl className="grid grid-cols-2 gap-y-6 border-y py-6 sm:grid-cols-4">
        {items.map((item) => <div key={item.label} className="pr-3"><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-2 font-mono text-3xl font-medium tabular-nums tracking-tight sm:text-4xl">{item.value}</dd><p className="mt-2 text-[11px] text-muted-foreground">{item.description}</p></div>)}
      </dl>
    </section>
  );
}
