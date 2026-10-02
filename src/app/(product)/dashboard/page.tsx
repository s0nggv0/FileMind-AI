import type { Metadata } from "next";
import { DashboardHeader } from "@/features/dashboard/dashboard-header";
import { Overview } from "@/features/dashboard/overview";
import { getDashboardPresentation } from "@/services/presentation-repository";
import { getWorkspacePresentation } from "@/lib/server/workspace-presentation";
import { WorkspaceHistory } from "@/features/dashboard/workspace-history";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  const data = getDashboardPresentation();
  const saved = await getWorkspacePresentation();
  return <div className="space-y-8"><DashboardHeader snapshot={data.snapshot} persistent /><WorkspaceHistory {...saved} /><details className="border-t pt-5"><summary className="cursor-pointer text-sm text-muted-foreground">Example workspace · Demo Insights</summary><div className="mt-6"><Overview data={data} /></div></details></div>;
}
