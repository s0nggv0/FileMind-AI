import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";

export function KnowledgeTopics({ topics }: { topics: { name: string; count: number; documentId?: string }[] }) {
  return (
    <section aria-labelledby="topics-heading">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"><h2 id="topics-heading" className="text-sm font-semibold">资料主题</h2><p className="text-[11px] text-muted-foreground">按示例资料标签统计 · 一份资料可属于多个主题</p></div>
      {topics.length ? <ul className="flex flex-wrap gap-3">{topics.map((topic) => <li key={topic.name}><Link href={topic.documentId ? `/library?document=${topic.documentId}` : "/library"} className="surface-interactive flex min-h-12 items-center gap-4 border bg-card px-4 text-sm"><span>{topic.name}</span><span className="font-mono text-[11px] text-muted-foreground">{topic.count} {topic.count === 1 ? "file" : "份文件"}</span><ArrowUpRight size={12} className="text-muted-foreground" /></Link></li>)}</ul> : <EmptyState title="主题还在形成" description="添加资料后，探索它们共同的主题。" />}
    </section>
  );
}
