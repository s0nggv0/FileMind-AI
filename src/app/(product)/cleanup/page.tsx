import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { SessionCleanup } from "@/features/workspace/components/session-results";
import { getDemoCleanupIssues } from "@/lib/demo/repository";
import { getAppliedPlans } from "@/lib/server/workspace-presentation";
import { APPLIED_PLAN_WORKSPACE_LIMIT } from "@/lib/workspace/presentation-limits";

export default async function CleanupPage() {
  const saved = await getAppliedPlans();
  return <Reveal className="space-y-7"><PageHeader title="重复候选" description="核对两份资料与判断依据，修改审阅决定。原件始终保留。" /><DemoNote>工作区候选来自已应用的整理方案；预置示例可切换。候选确认记录保留，原文件全部保留。</DemoNote>{saved.persistent && <p className="text-xs text-muted-foreground">已保存方案范围：最近更新的 {APPLIED_PLAN_WORKSPACE_LIMIT} 个工作区中已应用的方案（共 {saved.totalWorkspaces} 个工作区）。较早方案仍保留，可打开原工作区查看；当前会话及示例另行切换。</p>}<SessionCleanup savedPlans={saved.plans} preferSession={saved.persistent} examples={getDemoCleanupIssues()} /></Reveal>;
}
