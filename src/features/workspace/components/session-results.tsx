"use client";

import { useState } from "react";
import Link from "next/link";
import { systemMessage } from "@/lib/ui-labels";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { LibraryBrowser } from "@/features/library/library-browser";
import { GraphPreview } from "@/features/graph/graph-preview";
import { CleanupReview } from "@/features/cleanup/cleanup-review";
import { useWorkspaceStore } from "../store/workspace-store";
import { sessionDocuments, sessionGraph } from "../services/session-presentation";
import type { OrganizationPlan } from "@/types/workspace";
import type { CleanupIssueViewModel, DocumentViewModel, GraphNodeViewModel, GraphEdgeViewModel } from "@/types";

function SourceSwitch({ local, onChange, count, persistent }: { local: boolean; onChange: (local: boolean) => void; count: number; persistent?: boolean }) {
  return <div className="flex flex-wrap gap-2" role="group" aria-label="资料来源"><Button size="sm" variant={local ? "secondary" : "ghost"} aria-pressed={local} onClick={() => onChange(true)}>{persistent ? "已保存工作区" : "当前会话"} · {count} 份文件</Button><Button size="sm" variant={!local ? "secondary" : "ghost"} aria-pressed={!local} onClick={() => onChange(false)}>示例工作区</Button></div>;
}
export function SessionCleanup({ savedPlans, preferSession, examples }: { savedPlans: (OrganizationPlan & {workspaceId?:string;revision?:number})[]; preferSession: boolean; examples: CleanupIssueViewModel[] }) {
  const session = useWorkspaceStore(state => state.applied);
  const applied: (OrganizationPlan & {workspaceId?:string;revision?:number})[] = [...session.filter(s => !savedPlans.some(p => p.documents[0]?.id === s.documents[0]?.id)), ...savedPlans];
  const [local, setLocal] = useState(preferSession || applied.length > 0);
  const issues: CleanupIssueViewModel[] = applied.flatMap(plan => plan.duplicates.flatMap(candidate => {
    const files = [...new Set(candidate.documentIds)].map(id => plan.documents.find(d => d.id === id)?.name);
    if (files.length < 2 || files.some(name => !name)) return [];
    return [{ id: `${plan.documents[0]?.id}:${candidate.id}`, type: "duplicate" as const, title: files.join(" ↔ "), description: `${candidate.kind === "exact" ? "文件完全相同" : candidate.kind === "text" ? "正文相同" : "疑似重复（名称相似）"} · ${systemMessage(candidate.reason)}`, files: files as string[], documentLinks:candidate.documentIds.map(id => ({id,name:plan.documents.find(d => d.id === id)!.name})), ...(plan.workspaceId && plan.revision !== undefined ? {review:{workspaceId:plan.workspaceId,candidateId:candidate.id,revision:plan.revision,decision:candidate.decision,kind:candidate.kind}} : {}), recommendation: candidate.decision === "accepted" ? "审阅时已确认此候选；原文件仍全部保留。" : "此候选尚未确认，请对照资料核对内容。", preview: { label: "候选审阅状态", before: `${files.length} 份资料均保留`, after: candidate.decision === "accepted" ? "已确认重复候选" : candidate.decision === "ignored" ? "已忽略此候选" : "待决定" } }];
  }));
  return <div className="space-y-5"><SourceSwitch local={local} onChange={setLocal} count={sessionDocuments(applied).length} persistent={preferSession} /><CleanupReview key={local ? `workspace:${issues.map(i => i.id).join(",")}` : "example"} issues={local ? issues : examples} dataset={local ? "workspace" : "example"} /></div>;
}
export function SessionLibrary({ documents, categories, initialSelectedId, preferSession, persistentDocuments = [], persistent = false }: { documents: DocumentViewModel[]; categories: string[]; initialSelectedId?: string; preferSession: boolean; persistentDocuments?: DocumentViewModel[]; persistent?: boolean }) {
  const applied = useWorkspaceStore((state) => state.applied);
  const [local, setLocal] = useState(preferSession || (!initialSelectedId && applied.length > 0));
  const imported = [...new Map([...sessionDocuments(applied), ...persistentDocuments].map(d => [d.id, d])).values()];
  const groups = applied.flatMap((plan) => plan.duplicates.filter((item) => item.decision === "accepted").map((item) => item.documentIds.map((id) => plan.documents.find((document) => document.id === id)?.name).join(" ↔ ")));
  return <div className="space-y-5"><SourceSwitch local={local} onChange={setLocal} count={imported.length} persistent={persistent} />{local ? imported.length ? <><p className="text-xs text-muted-foreground">{persistent ? "已保存的工作区资料 · 原文件均保留。" : "本地解析资料 · 使用规则整理 · 刷新会清空当前会话。"}</p>{groups.length > 0 && <details className="rounded-lg bg-muted p-4 text-xs"><summary className="cursor-pointer">{groups.length} 组已确认的重复候选 · 保留全部文件</summary><ul className="mt-3 space-y-2">{groups.map((group, index) => <li key={index} className="break-words">{group}</li>)}</ul></details>}<LibraryBrowser key="session" documents={imported} categories={[...new Set(imported.map((document) => document.category))]} dataset="workspace" initialSelectedId={initialSelectedId} persistent={persistent} /></> : <EmptyState title="当前会话的资料库为空" description="应用整理方案后，可以在这里查看自己的资料。"><Button asChild><Link href="/workspace">打开工作区</Link></Button></EmptyState> : <LibraryBrowser key={initialSelectedId ?? "example"} documents={documents} categories={categories} initialSelectedId={initialSelectedId} />}</div>;
}
export function SessionGraph({ nodes, edges, documents, preferSession, savedPlans = [] }: { nodes: GraphNodeViewModel[]; edges: GraphEdgeViewModel[]; documents: DocumentViewModel[]; preferSession: boolean; savedPlans?: OrganizationPlan[] }) {
  const session = useWorkspaceStore((state) => state.applied); const applied = [...session.filter(s => !savedPlans.some(p => p.documents[0]?.id === s.documents[0]?.id)), ...savedPlans]; const [local, setLocal] = useState(preferSession || applied.length > 0); const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const index = selectedIndex ?? applied.length - 1; const plan = applied[index];
  const graph = plan ? sessionGraph(plan) : null;
  return <div className="space-y-5"><SourceSwitch local={local} onChange={setLocal} count={sessionDocuments(applied).length} persistent={preferSession} />{local ? graph && plan ? <>{applied.length > 1 && <label className="flex items-center gap-3 text-xs">工作区整理记录<select aria-label="工作区整理记录" className="min-h-11 rounded-lg border bg-card px-3" value={index} onChange={(event) => setSelectedIndex(Number(event.target.value))}>{applied.map((item, position) => <option key={position} value={position}>整理记录 {position + 1} · {item.documents.length} 份文件</option>)}</select></label>}<p className="text-sm">当前范围：整理记录 {index + 1} · {plan.documents.length} 份资料 · {plan.documents.slice(0, 3).map(d => d.name).join("、")}{plan.documents.length > 3 ? "等" : ""}</p><p className="text-xs text-muted-foreground">关联来自共同标签和分类，未进行语义相似度判断。 {graph.edges.length === 0 && "未发现共同主题，文件将显示为独立节点。"}</p><GraphPreview key={`session-${index}`} nodes={graph.nodes} edges={graph.edges} documents={sessionDocuments([plan])} dataset="workspace" /></> : <EmptyState title="工作区暂无关联" description="整理文件并应用方案后，可以查看规则生成的关联。"><Button asChild><Link href="/workspace">打开工作区</Link></Button></EmptyState> : <GraphPreview key="example" nodes={nodes} edges={edges} documents={documents} />}</div>;
}
