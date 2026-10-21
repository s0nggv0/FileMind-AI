import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { SessionCleanup } from "@/features/workspace/components/session-results";
import { getDemoCleanupIssues } from "@/lib/demo/repository";
import { getWorkspacePresentation } from "@/lib/server/workspace-presentation";

export default async function CleanupPage() {
  const saved = await getWorkspacePresentation();
  return <Reveal className="space-y-7"><PageHeader title="重复候选" description="核对两份资料与判断依据，修改审阅决定。原件始终保留。" /><DemoNote>工作区候选来自已应用的整理方案；预置示例可切换。候选确认记录保留，原文件全部保留。</DemoNote><SessionCleanup savedPlans={saved.plans} preferSession={saved.persistent} examples={getDemoCleanupIssues()} /></Reveal>;
}
