"use client";

import Link from "next/link";
import { Check, Library, Network, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OrganizationPlan } from "@/types/workspace";
import { useWorkspaceStore } from "../store/workspace-store";

export function CompletionState({ plan }: { plan: OrganizationPlan }) {
  const reset = useWorkspaceStore((state) => state.reset);
  const persistent = useWorkspaceStore((state) => state.persistent);
  return <section className="py-12 text-center sm:py-20" role="status"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-primary"><Check size={26} /></span><h2 className="mt-6 text-3xl font-medium">工作区已整理</h2><div className="mt-5 space-y-2 text-sm text-muted-foreground"><p>{plan.documents.length} 份资料已整理</p><p>{new Set(plan.documents.map((document) => document.category)).size} 个分类已建立</p><p>{plan.relationships.length} 条规则关联</p><p>{plan.duplicates.filter((item) => item.decision === "accepted").length} 组重复候选已标记 · 保留全部文件</p></div><p className="mt-6 text-xs text-muted-foreground">{persistent ? "工作区已保存，刷新后可恢复这些结果。原文件均已保留。" : "整理方案仅保存在当前浏览器会话，原文件未被修改。"}</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Button asChild><Link href="/library?source=workspace"><Library size={16} />查看资料库</Link></Button><Button asChild variant="outline"><Link href="/graph?source=workspace"><Network size={16} />探索知识图谱</Link></Button><Button variant="ghost" onClick={reset}><Plus size={16} />新建工作区</Button></div></section>;
}
