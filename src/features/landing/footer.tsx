import Link from "next/link";
import { Brand } from "@/components/shell/brand";

export function Footer() {
  return (
    <footer className="marketing-width flex flex-col justify-between gap-6 py-8 sm:flex-row sm:items-center">
      <Brand />
      <p className="text-xs text-muted-foreground">Built for curiosity. Designed for clarity.<br /><span className="mt-1 inline-block">全国高校 AI Web 开发挑战赛 · Phase 2 演示</span></p>
      <nav aria-label="页脚导航" className="flex gap-5 text-xs text-muted-foreground"><Link href="/dashboard" className="py-3 hover:text-foreground">Overview</Link><Link href="/workspace" className="py-3 hover:text-foreground">Workspace</Link><a href="https://github.com/s0nggv0/FileMind-AI" target="_blank" rel="noopener noreferrer" className="py-3 hover:text-foreground">GitHub</a></nav>
    </footer>
  );
}
