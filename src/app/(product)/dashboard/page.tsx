import type { Metadata } from "next";
import { DashboardHeader } from "@/features/dashboard/dashboard-header";
import { Overview } from "@/features/dashboard/overview";
import { getDashboardPresentation } from "@/services/presentation-repository";

export const metadata: Metadata = { title: "Overview" };

export default function DashboardPage() {
  const data = getDashboardPresentation();
  return <div className="space-y-8"><DashboardHeader snapshot={data.snapshot} /><Overview data={data} /></div>;
}
