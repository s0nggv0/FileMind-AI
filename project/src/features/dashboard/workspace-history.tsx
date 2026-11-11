import Link from "next/link";
import { stateLabel } from "@/lib/ui-labels";
import { EmptyState } from "@/components/feedback/empty-state";
import { RecentFiles } from "./recent-files";
import type { WorkspaceHistoryOverview } from "@/lib/workspace/postgres-repository";
import type { RecentDocument } from "@/lib/workspace/presentation-reads";
import { WORKSPACE_HISTORY_LIMIT } from "@/lib/workspace/presentation-limits";
export function WorkspaceHistory({ workspaces, activity, documents, persistent, totalDocuments, totalWorkspaces, recentReviewWorkspaces }: WorkspaceHistoryOverview & { documents: RecentDocument[]; persistent: boolean }) {
  return <div className="space-y-8">
    <div className="grid grid-cols-2 gap-6 border-y py-6 sm:grid-cols-3">{[["资料", totalDocuments], ["工作区", totalWorkspaces], ["最近待审阅的工作区", recentReviewWorkspaces]].map(([label, count]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-3xl tabular-nums">{count}</p></div>)}</div>
    {totalWorkspaces > WORKSPACE_HISTORY_LIMIT && <p className="text-xs text-muted-foreground">历史、最近待审阅统计及动态仅覆盖最近更新的 {WORKSPACE_HISTORY_LIMIT} 个工作区（共 {totalWorkspaces} 个）。较早工作区仍保留，可通过原工作区链接打开。</p>}
    <section><h2 className="text-sm font-semibold">最近工作区</h2>{workspaces.length ? <ul className="mt-4 divide-y border-y">{workspaces.map(w => <li key={w.id}><Link className="flex flex-wrap items-center justify-between gap-4 py-5" href={`/workspace?workspace=${w.id}`}><div><p className="text-sm font-medium">{w.name}</p><p className="mt-2 text-xs text-muted-foreground">{w.documentCount} 份资料 · {stateLabel(w.status)}</p></div><time className="text-xs text-muted-foreground">{new Date(w.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></Link></li>)}</ul> : <EmptyState title="还没有保存的工作区" description={persistent ? "导入文件，创建第一个可保存的工作区。" : "当前可使用本地演示。配置持久化存储后，可以保存和恢复工作区。"} />}</section>
    <RecentFiles documents={documents} />
    <section><h2 className="text-sm font-semibold">最近动态</h2><ol className="mt-4 divide-y">{activity.map(event => <li key={event.id} className="py-3 text-sm"><Link href={`/workspace?workspace=${event.workspaceId}`}>{event.message}</Link><time className="ml-3 text-xs text-muted-foreground">{new Date(event.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></li>)}</ol>{!activity.length && <p className="mt-3 text-xs text-muted-foreground">暂无工作区动态。</p>}</section>
  </div>;
}
