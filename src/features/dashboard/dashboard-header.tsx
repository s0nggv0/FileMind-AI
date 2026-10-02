import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoNote } from "@/components/common/demo-note";

export function DashboardHeader({ snapshot, persistent }: { snapshot: string; persistent?: boolean }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><h1 className="text-3xl font-medium leading-tight tracking-tight sm:text-4xl">Good evening.</h1><p className="mt-3 text-sm text-muted-foreground">Your knowledge space is ready.</p></div>
        <Button asChild variant="outline"><Link href="/workspace">打开工作台 <ArrowUpRight /></Link></Button>
      </div>
      <DemoNote>{persistent ? "你的 Workspace 与资料记录。示例知识空间和 Demo Insights 可在下方展开。" : `示例知识空间 · ${snapshot} 数据快照。Insights 与活动均为演示，不代表真实 AI 处理结果。`}</DemoNote>
    </div>
  );
}
