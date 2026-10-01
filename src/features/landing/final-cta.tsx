import Link from "next/link";
import { ArrowRight, Network } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCTA() {
  return (
    <section className="border-y bg-surface-primary">
      <div className="marketing-width marketing-section text-center">
        <Network size={28} strokeWidth={1.4} className="mx-auto mb-6 text-primary" aria-hidden="true" />
        <h2 className="mx-auto max-w-3xl text-3xl font-medium leading-tight sm:text-4xl">Your files already contain<br className="hidden sm:block" /> a knowledge system.</h2>
        <p className="mt-5 text-base text-muted-foreground">FileMind helps you uncover it.</p>
        <Button asChild size="lg" className="mt-7"><Link href="/workspace">Open your workspace <ArrowRight /></Link></Button>
        <p className="mt-4 text-xs text-muted-foreground">从示例工作台开始体验 · 无需登录</p>
      </div>
    </section>
  );
}
