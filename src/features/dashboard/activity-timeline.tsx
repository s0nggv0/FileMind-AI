import Link from "next/link";
import { Clock3 } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";

type ActivityGroup = {
  label: string;
  date: string;
  items: { id: string; title: string; detail: string; time: string; href: string }[];
};

export function ActivityTimeline({ groups }: { groups: ActivityGroup[] }) {
  return (
    <section aria-labelledby="activity-heading">
      <div className="mb-4 flex min-h-11 items-center justify-between"><h2 id="activity-heading" className="text-sm font-semibold">资料动态</h2><Clock3 size={14} className="text-muted-foreground" /></div>
      {groups.length ? <div className="space-y-5 border-t pt-5">{groups.map((group) => <div key={group.label}><h3 className="mb-3 flex items-center gap-2 text-xs font-medium">{group.label}<span className="font-mono text-[11px] font-normal text-muted-foreground">{group.date} · 示例</span></h3><ol className="ml-1 border-l">{group.items.map((item) => <li key={item.id} className="relative pl-5"><span className="absolute -left-[3px] top-5 size-[5px] rounded-full bg-primary" /><Link href={item.href} className="surface-interactive block px-2 py-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium">{item.title}</p><span className="font-mono text-[10px] text-muted-foreground">{item.time}</span></div><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{item.detail}</p></Link></li>)}</ol></div>)}</div> : <EmptyState title="还没有活动" description="你的资料变化会出现在这里。" />}
    </section>
  );
}
