import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { FileIntake } from "@/features/workspace/file-intake";
import { getDemoDocuments, getDemoWorkspaceSteps } from "@/services/demo-repository";

export default function WorkspacePage() {
  return <Reveal className="space-y-7"><PageHeader title="让资料，找到自己的位置。" description="一个安静的工作台，用来理解内容、连接知识、审阅整理方案。" /><DemoNote>界面演示 · 本地选择仅保留在当前页面，未上传文件、未调用 AI。</DemoNote><FileIntake documents={getDemoDocuments()} steps={getDemoWorkspaceSteps()} /></Reveal>;
}
