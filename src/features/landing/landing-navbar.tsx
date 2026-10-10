"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Code2, Menu } from "lucide-react";
import { Brand } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function LandingNavbar({ links }: { links: { label: string; href: string }[] }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={cn("sticky top-0 z-30 border-b transition-colors", scrolled ? "border-border bg-background/90 backdrop-blur-sm" : "border-transparent bg-background")}>
      <div className="marketing-width flex h-20 items-center justify-between gap-4">
        <Link href="/" aria-label="FileMind AI 首页"><Brand /></Link>
        <nav aria-label="产品导航" className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {links.map((link) => <a key={link.href} href={link.href} className="py-3 transition-colors hover:text-foreground">{link.label}</a>)}
        </nav>
        <div className="flex items-center gap-2 sm:gap-4">
          <a href="https://github.com/s0nggv0/FileMind-AI" target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 py-3 text-sm text-muted-foreground hover:text-foreground sm:flex"><Code2 size={16} /> GitHub <ArrowUpRight size={12} /></a>
          <Button asChild size="sm"><Link href="/workspace">打开应用 <ArrowUpRight /></Link></Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="打开产品导航"><Menu /></Button></DialogTrigger>
            <DialogContent>
              <DialogTitle>了解 FileMind</DialogTitle>
              <DialogDescription>了解产品，或进入示例工作台。</DialogDescription>
              <nav aria-label="移动产品导航" className="grid gap-2">
                {links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="surface-interactive p-3 text-sm">{link.label}</a>)}
                <a href="https://github.com/s0nggv0/FileMind-AI" target="_blank" rel="noopener noreferrer" className="surface-interactive flex items-center gap-2 p-3 text-sm" onClick={() => setOpen(false)}><Code2 size={16} /> GitHub <ArrowUpRight size={14} /></a>
              </nav>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
