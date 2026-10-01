import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { Overview } from "@/features/dashboard/overview";
import { getDemoOverview, getDemoDocuments, getDemoActivities } from "@/services/demo-repository";

export default function DashboardPage() {
  return <Reveal className="space-y-7"><PageHeader title="先找到，再组织。" description="欢迎来到你的知识空间。让资料之间的联系，逐渐清晰。" /><DemoNote /><Overview overview={getDemoOverview()} documents={getDemoDocuments()} activities={getDemoActivities()} /></Reveal>;
}
