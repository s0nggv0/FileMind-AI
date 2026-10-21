import { developmentControls, competitionMode } from "@/lib/competition";
import { PageHeader } from "@/components/common/page-header";
import { Reveal } from "@/components/motion/reveal";
import { Workspace } from "@/features/workspace/workspace";

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const { workspace } = await searchParams;
  return <Reveal className="space-y-7"><PageHeader title="导入与整理" description="导入资料，审阅后保存，再向资料提问。" /><Workspace workspaceId={workspace} demoMode={!developmentControls()} competition={competitionMode()} /></Reveal>;
}
