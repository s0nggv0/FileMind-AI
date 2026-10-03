import { PageHeader } from "@/components/common/page-header";
import { Reveal } from "@/components/motion/reveal";
import { Workspace } from "@/features/workspace/workspace";

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const { workspace } = await searchParams;
  return <Reveal className="space-y-7"><PageHeader title="让资料，找到自己的位置。" description="导入文件，观察 Agent 执行，再审阅属于你的整理方案。" /><Workspace workspaceId={workspace} demoMode={process.env.DEMO_MODE==="true"} /></Reveal>;
}
