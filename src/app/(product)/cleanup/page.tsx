import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { CleanupReview } from "@/features/cleanup/cleanup-review";
import { getDemoCleanupIssues } from "@/services/demo-repository";

export default function CleanupPage() {
  return <Reveal className="space-y-7"><PageHeader title="留住价值，减少杂乱。" description="审阅内容重叠、信息更新与标签建议，保持知识空间清晰。" /><DemoNote>审阅界面演示 · 未运行重复检测，未创建可执行的整理任务。</DemoNote><CleanupReview issues={getDemoCleanupIssues()} /></Reveal>;
}
