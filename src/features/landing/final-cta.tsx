import Link from "next/link";
import { ArrowRight, Network } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCTA() {
  return (
    <section className="border-y bg-surface-primary">
      <div className="marketing-width marketing-section text-center">
        <Network size={28} strokeWidth={1.4} className="mx-auto mb-6 text-primary" aria-hidden="true" />
        <h2 className="mx-auto max-w-3xl text-3xl font-medium leading-tight sm:text-4xl">你的资料中，<br className="hidden sm:block" />  藏着相互关联的知识。</h2>
        <p className="mt-5 text-base text-muted-foreground">用 FileMind 整理资料，核对来源，继续探索。</p>
        <Button asChild size="lg" className="mt-7"><Link href="/workspace">打开工作区 <ArrowRight /></Link></Button>
        <p className="mt-4 text-xs text-muted-foreground">从示例工作台开始体验 · 无需登录</p>
      </div>
    </section>
  );
}
