import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { RecentFiles } from "./recent-files";
import type { WorkspaceSnapshot } from "@/lib/workspace/schemas";
import type { DemoDocument } from "@/types";
export function WorkspaceHistory({ workspaces, documents, persistent, totalDocuments, totalWorkspaces }: { workspaces: WorkspaceSnapshot[]; documents: DemoDocument[]; persistent: boolean; totalDocuments: number; totalWorkspaces: number }) {
  return <div className="space-y-8">
    <div className="grid grid-cols-2 gap-6 border-y py-6 sm:grid-cols-3">{[["Documents", totalDocuments], ["Workspaces", totalWorkspaces], ["Recent workspaces awaiting review", workspaces.filter(w => w.run?.status === "waiting_for_review").length]].map(([label, count]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-3xl tabular-nums">{count}</p></div>)}</div>
    <section><h2 className="text-sm font-semibold">Recent Workspaces</h2>{workspaces.length ? <ul className="mt-4 divide-y border-y">{workspaces.map(w => <li key={w.id}><Link className="flex flex-wrap items-center justify-between gap-4 py-5" href={`/workspace?workspace=${w.id}`}><div><p className="text-sm font-medium">{w.name}</p><p className="mt-2 text-xs text-muted-foreground">{w.documents.length} documents · {w.run?.status ?? "draft"}</p></div><time className="text-xs text-muted-foreground">{new Date(w.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></Link></li>)}</ul> : <EmptyState title="No saved workspaces yet" description={persistent ? "Import files to create your first persistent workspace." : "Local-only Demo is available. Set up persistent storage to save and restore workspaces."} />}</section>
    <RecentFiles documents={documents.slice(0, 4)} />
    <section><h2 className="text-sm font-semibold">Recent Activity</h2><ol className="mt-4 divide-y">{workspaces.flatMap(w => w.run?.activity.slice(-3).map(event => ({ ...event, workspaceId: w.id })) ?? []).sort((a, b) => b.at - a.at).slice(0, 10).map(event => <li key={event.id} className="py-3 text-sm"><Link href={`/workspace?workspace=${event.workspaceId}`}>{event.message}</Link><time className="ml-3 text-xs text-muted-foreground">{new Date(event.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></li>)}</ol>{!workspaces.some(w => w.run?.activity.length) && <p className="mt-3 text-xs text-muted-foreground">No workspace activity yet.</p>}</section>
  </div>;
}
