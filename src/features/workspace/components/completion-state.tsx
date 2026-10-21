"use client";

import Link from "next/link";
import { Check, Library, Network, Plus, MessageSquare } from "lucide-react";
import { LibraryReadiness } from "@/components/knowledge/library-readiness";
import { Button } from "@/components/ui/button";
import type { OrganizationPlan } from "@/types/workspace";
import { useWorkspaceStore } from "../store/workspace-store";

export function CompletionState({ plan }: { plan: OrganizationPlan }) {
  const reset = useWorkspaceStore((state) => state.reset);
  const persistent = useWorkspaceStore((state) => state.persistent);
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  return <section className="py-6 text-center sm:py-10" role="status"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-primary"><Check size={26} /></span><h2 className="mt-6 text-3xl font-medium">工作区已整理</h2><div className="mt-5 flex flex-wrap justify-center gap-3">{persistent && workspaceId && <Button asChild><Link href={`/search?workspace=${workspaceId}`}><MessageSquare size={16} />向这批资料提问</Link></Button>}<Button asChild variant="outline"><Link href="/library?source=workspace"><Library size={16} />查看资料库</Link></Button><Button asChild variant="outline"><Link href="/graph?source=workspace"><Network size={16} />探索知识图谱</Link></Button><Button variant="ghost" onClick={reset}><Plus size={16} />新建工作区</Button></div><p className="mt-5 text-sm leading-7 text-muted-foreground">{plan.documents.length} 份资料 · {new Set(plan.documents.map(d => d.category)).size} 个分类 · {plan.relationships.length} 条规则关联<br />{plan.duplicates.filter(d => d.decision === "accepted").length} 组重复候选已标记，全部原件保留。</p><p className="mt-6 text-xs text-muted-foreground">{persistent ? "工作区已保存，刷新后可恢复这些结果。原文件均已保留。" : "整理方案仅保存在当前浏览器会话，原文件未被修改。"}</p>{persistent && <div className="mx-auto mt-5 max-w-xl"><LibraryReadiness workspaceId={workspaceId} /><p className="mt-4 text-left text-xs leading-6 text-muted-foreground">此浏览器记住你的资料身份。清除 Cookie 或换浏览器前，可到 <Link href="/settings#identity" className="text-primary underline">设置保留恢复方式</Link>。恢复身份与备份资料是两件事，不必现在生成密钥。</p></div>}</section>;
}
