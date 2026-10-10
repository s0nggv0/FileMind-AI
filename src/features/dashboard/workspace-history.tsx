import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { RecentFiles } from "./recent-files";
import type { WorkspaceSnapshot } from "@/lib/workspace/schemas";
import type { DemoDocument } from "@/types";
export function WorkspaceHistory({ workspaces, documents, persistent, totalDocuments, totalWorkspaces }: { workspaces: WorkspaceSnapshot[]; documents: DemoDocument[]; persistent: boolean; totalDocuments: number; totalWorkspaces: number }) {
  return <div className="space-y-8">
    <div className="grid grid-cols-2 gap-6 border-y py-6 sm:grid-cols-3">{[["资料", totalDocuments], ["工作区", totalWorkspaces], ["最近待审阅的工作区", workspaces.filter(w => w.run?.status === "waiting_for_review").length]].map(([label, count]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-3xl tabular-nums">{count}</p></div>)}</div>
    <section><h2 className="text-sm font-semibold">最近工作区</h2>{workspaces.length ? <ul className="mt-4 divide-y border-y">{workspaces.map(w => <li key={w.id}><Link className="flex flex-wrap items-center justify-between gap-4 py-5" href={`/workspace?workspace=${w.id}`}><div><p className="text-sm font-medium">{w.name}</p><p className="mt-2 text-xs text-muted-foreground">{w.documents.length} 份资料 · {w.run?.status ?? "draft"}</p></div><time className="text-xs text-muted-foreground">{new Date(w.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></Link></li>)}</ul> : <EmptyState title="还没有保存的工作区" description={persistent ? "导入文件，创建第一个可保存的工作区。" : "当前可使用本地演示。配置持久化存储后，可以保存和恢复工作区。"} />}</section>
    <RecentFiles documents={documents.slice(0, 4)} />
    <section><h2 className="text-sm font-semibold">最近动态</h2><ol className="mt-4 divide-y">{workspaces.flatMap(w => w.run?.activity.slice(-3).map(event => ({ ...event, workspaceId: w.id })) ?? []).sort((a, b) => b.at - a.at).slice(0, 10).map(event => <li key={event.id} className="py-3 text-sm"><Link href={`/workspace?workspace=${event.workspaceId}`}>{event.message}</Link><time className="ml-3 text-xs text-muted-foreground">{new Date(event.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></li>)}</ol>{!workspaces.some(w => w.run?.activity.length) && <p className="mt-3 text-xs text-muted-foreground">暂无工作区动态。</p>}</section>
  </div>;
}
