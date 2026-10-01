import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { GraphPreview } from "@/features/graph/graph-preview";
import { getDemoDocuments, getDemoGraph } from "@/services/demo-repository";

export default function GraphPage() {
  const graph = getDemoGraph();
  return <Reveal className="space-y-7"><PageHeader title="知识之间，还有更多连接。" description="从一份文件出发，发现相关的概念、内容与思路。" /><DemoNote>关系预览 · 节点和边来自预置示例，尚未执行内容分析。</DemoNote><GraphPreview nodes={graph.nodes} edges={graph.edges} documents={getDemoDocuments()} /></Reveal>;
}
