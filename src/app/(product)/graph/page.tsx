import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { SessionGraph } from "@/features/workspace/components/session-results";
import { getDemoDocuments, getDemoGraph } from "@/services/demo-repository";

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const params = await searchParams;
  const graph = getDemoGraph();
  return <Reveal className="space-y-7"><PageHeader title="知识之间，还有更多连接。" description="从一份文件出发，发现相关的概念、内容与思路。" /><DemoNote>关系演示 · 本地 Session 使用共享分类和标签，预置示例可切换。没有真实语义推理。</DemoNote><SessionGraph key={params.source ?? "graph"} preferSession={params.source === "workspace"} nodes={graph.nodes} edges={graph.edges} documents={getDemoDocuments()} /></Reveal>;
}
