"use client";

import { usePathname } from "next/navigation";
import { Menu, Search, ChevronRight } from "lucide-react";
import { getNavigationItem } from "@/lib/navigation";
import { useUiStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { navIcons } from "./nav-icons";

export function Topbar() {
  const pathname = usePathname();
  const item = getNavigationItem(pathname);
  const Icon = item ? navIcons[item.iconKey] : null;
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  return <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-3 border-b bg-background px-4 sm:px-8">
    <div className="flex min-w-0 items-center gap-3">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="打开导航" onClick={() => setMobileNavOpen(true)}><Menu /></Button>
      <span className="hidden text-sm text-muted-foreground md:inline">我的知识空间</span><ChevronRight className="hidden size-3.5 text-muted-foreground md:inline" />
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}<span className="truncate text-sm font-medium">{item?.label ?? "设置"}</span>
    </div>
    <div className="flex shrink-0 items-center gap-3"><span className="hidden rounded-md border px-2 py-1 text-[11px] text-muted-foreground sm:inline">FileMind</span><Button variant="outline" className="gap-2 text-muted-foreground" aria-label="打开命令面板" onClick={() => setCommandOpen(true)}><Search /><span className="hidden sm:inline">搜索与导航</span><kbd className="ml-3 hidden rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] lg:inline">⌘ / Ctrl K</kbd></Button></div>
  </header>;
}
