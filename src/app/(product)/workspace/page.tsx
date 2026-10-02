import { PageHeader } from "@/components/common/page-header";
import { Reveal } from "@/components/motion/reveal";
import { Workspace } from "@/features/workspace/workspace";

export default function WorkspacePage() {
  return <Reveal className="space-y-7"><PageHeader title="让资料，找到自己的位置。" description="导入真实文件，观察 Agent 演示执行，再审阅属于你的整理方案。" /><Workspace /></Reveal>;
}
