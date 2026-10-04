import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { SessionCleanup } from "@/features/workspace/components/session-results";
import { getDemoCleanupIssues } from "@/services/demo-repository";
import { getWorkspacePresentation } from "@/lib/server/workspace-presentation";

export default async function CleanupPage() {
  const saved = await getWorkspacePresentation();
  return <Reveal className="space-y-7"><PageHeader title="留住价值，减少杂乱。" description="审阅整理方案中的重复候选，保持知识空间清晰。" /><DemoNote>工作区候选来自已应用的整理方案；预置示例可切换。候选确认记录保留，原文件全部保留。</DemoNote><SessionCleanup savedPlans={saved.plans} preferSession={saved.persistent} examples={getDemoCleanupIssues()} /></Reveal>;
}
