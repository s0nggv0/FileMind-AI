import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { SessionGraph } from "@/features/workspace/components/session-results";
import { getDemoDocuments, getDemoGraph } from "@/lib/demo/repository";
import { getWorkspacePresentation } from "@/lib/server/workspace-presentation";

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const params = await searchParams;
  const graph = getDemoGraph();
  const saved = await getWorkspacePresentation();
  return <Reveal className="space-y-7"><PageHeader title="相关资料图谱" description="按共同分类和标签探索资料，并打开原文核对。" /><DemoNote>规则关系 · 使用共享分类和标签，预置示例可切换。尚无语义相似度。</DemoNote><SessionGraph key={params.source ?? "graph"} preferSession={saved.persistent || params.source === "workspace"} savedPlans={saved.plans} nodes={graph.nodes} edges={graph.edges} documents={getDemoDocuments()} /></Reveal>;
}
