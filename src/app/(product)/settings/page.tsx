import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { Preferences } from "@/features/settings/preferences";
import { persistenceConfigured } from "@/lib/server/database";
import { getUserId } from "@/lib/server/identity";

export default async function SettingsPage() {
  await getUserId();
  return <Reveal className="space-y-7"><PageHeader title="让工作空间，适合你的习惯。" description="调整外观、恢复身份，管理你的资料备份。" />{!persistenceConfigured() && <DemoNote />}<Preferences /></Reveal>;
}
