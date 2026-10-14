import type { Metadata } from "next";
import { DashboardHeader } from "@/features/dashboard/dashboard-header";
import { Overview } from "@/features/dashboard/overview";
import { getDemoDashboardPresentation } from "@/lib/demo/presentation";
import { getWorkspacePresentation } from "@/lib/server/workspace-presentation";
import { WorkspaceHistory } from "@/features/dashboard/workspace-history";

export const metadata: Metadata = { title: "概览" };

export default async function DashboardPage() {
  const data = getDemoDashboardPresentation();
  const saved = await getWorkspacePresentation();
  return <div className="space-y-8"><DashboardHeader snapshot={data.snapshot} persistent /><WorkspaceHistory {...saved} /><details className="border-t pt-5"><summary className="cursor-pointer text-sm text-muted-foreground">示例工作区 · 演示概览</summary><div className="mt-6"><Overview data={data} /></div></details></div>;
}
