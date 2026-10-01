"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Settings, ChevronDown } from "lucide-react";
import { navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";
import { navIcons } from "./nav-icons";
import { Brand } from "./brand";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 pb-5 pt-7">
    <Link href="/workspace" aria-label="FileMind AI 工作空间" onClick={onNavigate} className="mx-3 w-fit rounded-sm"><Brand /></Link>
    <div className="mx-2 mb-8 mt-9 flex items-center gap-3 rounded-lg border bg-card px-3 py-3">
      <span className="flex size-8 items-center justify-center rounded-md bg-secondary text-xs font-semibold">FM</span>
      <div className="min-w-0 flex-1"><p className="text-sm font-medium">我的知识空间</p><p className="mt-0.5 text-[11px] text-muted-foreground">本地演示模式</p></div>
      <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </div>
    <nav aria-label="主要导航" className="space-y-1">
      {navItems.map((item) => {
        const Icon = navIcons[item.iconKey];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors", active ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}><Icon className="size-[18px] shrink-0" strokeWidth={1.7} /><span>{item.label}</span></Link>;
      })}
    </nav>
    <div className="mt-auto pt-12">
      <div className="mx-3 mb-7 border-t pt-5"><p className="text-xs leading-5 text-muted-foreground">让散乱的文件，<br />成为相互连接的知识。</p><Link href="/workspace" onClick={onNavigate} className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary">打开工作空间<ArrowUpRight className="size-3.5" /></Link></div>
      <Link href="/settings" onClick={onNavigate} aria-current={pathname === "/settings" ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors", pathname === "/settings" ? "bg-accent text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}><Settings className="size-[18px]" strokeWidth={1.7} />Settings</Link>
      <div className="mx-3 mt-4 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />Phase 1 · Foundation</div>
    </div>
  </div>;
}

export function Sidebar() {
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  return <>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r bg-background lg:block"><SidebarContent /></aside>
    <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <DialogContent className="inset-y-0 left-0 top-0 h-dvh w-[min(288px,85vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0">
        <DialogTitle className="sr-only">知识空间导航</DialogTitle><DialogDescription className="sr-only">选择页面，或按 Escape 关闭导航。</DialogDescription>
        <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
      </DialogContent>
    </Dialog>
  </>;
}
