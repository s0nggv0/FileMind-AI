import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { SessionGraph } from "@/features/workspace/components/session-results";
import { getDemoDocuments, getDemoGraph } from "@/lib/demo/repository";
import { getAppliedPlans } from "@/lib/server/workspace-presentation";
import { APPLIED_PLAN_WORKSPACE_LIMIT } from "@/lib/workspace/presentation-limits";

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const params = await searchParams;
  const graph = getDemoGraph();
  const saved = await getAppliedPlans();
  return <Reveal className="space-y-7"><PageHeader title="相关资料图谱" description="按共同分类和标签探索资料，并打开原文核对。" /><DemoNote>规则关系 · 使用共享分类和标签，预置示例可切换。尚无语义相似度。</DemoNote>{saved.persistent && <p className="text-xs text-muted-foreground">已保存方案范围：最近更新的 {APPLIED_PLAN_WORKSPACE_LIMIT} 个工作区中已应用的方案（共 {saved.totalWorkspaces} 个工作区）。较早方案仍保留，可打开原工作区查看；当前会话及示例另行切换。</p>}<SessionGraph key={params.source ?? "graph"} preferSession={saved.persistent || params.source === "workspace"} savedPlans={saved.plans} nodes={graph.nodes} edges={graph.edges} documents={getDemoDocuments()} /></Reveal>;
}
