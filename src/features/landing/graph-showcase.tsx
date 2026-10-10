import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RelationshipDemo } from "@/components/knowledge/relationship-demo";
import type { RelationshipEdge, RelationshipNode } from "@/types/presentation";

export function GraphShowcase({ nodes, edges }: { nodes: RelationshipNode[]; edges: RelationshipEdge[] }) {
  return (
    <section className="marketing-width marketing-section grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
      <div className="surface-secondary p-3 sm:p-6"><RelationshipDemo nodes={nodes} edges={edges} /></div>
      <div><h2 className="section-title">让你的资料<br />彼此关联。</h2><p className="mt-5 text-base leading-7 text-muted-foreground">从文档与概念出发，<br className="hidden lg:block" />  探索知识之间的联系。</p><p className="mt-4 max-w-sm text-sm leading-7 text-muted-foreground">一份 Transformer 笔记，连着 Attention、BERT 和你的 NLP 课程。沿着这些联系，把读过的资料变成能够继续探索的知识。</p><Button asChild variant="ghost" className="mt-5 -ml-4"><Link href="/graph">探索知识图谱 <ArrowRight /></Link></Button><p className="mt-3 text-[11px] text-muted-foreground">示例关系 · 移动端展示核心 4 个节点</p></div>
    </section>
  );
}
