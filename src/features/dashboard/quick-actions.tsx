import Link from "next/link";
import { ArrowRight, FolderInput, Network, Search } from "lucide-react";

type QuickAction = { label: string; description: string; href: string; icon: "organize" | "search" | "graph" };
const actionIcons = { organize: FolderInput, search: Search, graph: Network };

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <section aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="mb-4 text-sm font-semibold">Continue exploring</h2>
      <div className="grid border-y sm:grid-cols-3">{actions.map((action) => {
        const Icon = actionIcons[action.icon];
        return <Link key={action.href} href={action.href} className="group flex items-center gap-3 border-b px-2 py-5 transition-colors last:border-0 hover:bg-accent sm:border-b-0 sm:px-4"><Icon size={18} strokeWidth={1.5} className="shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="text-xs font-medium lg:text-sm">{action.label}</p><p className="mt-1.5 text-[11px] text-muted-foreground">{action.description}</p></div><ArrowRight size={14} className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary" /></Link>;
      })}</div>
    </section>
  );
}
