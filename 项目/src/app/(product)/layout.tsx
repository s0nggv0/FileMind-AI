import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/command-palette/command-palette";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh"><a href="#main-content" className="sr-only fixed left-4 top-3 z-[100] rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground focus:not-sr-only">跳到主内容</a><Sidebar /><div className="min-w-0 lg:pl-[232px]"><Topbar /><main id="main-content" className="min-w-0 px-5 py-8 sm:px-8 sm:py-10 xl:px-12"><div className="content-width">{children}</div></main></div><CommandPalette /></div>;
}
