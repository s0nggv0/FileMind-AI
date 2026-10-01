import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { Preferences } from "@/features/settings/preferences";

export default function SettingsPage() {
  return <Reveal className="space-y-7"><PageHeader title="让工作空间，适合你的习惯。" description="调整界面偏好，查看连接状态与基础组件。" /><DemoNote /><Preferences /></Reveal>;
}
