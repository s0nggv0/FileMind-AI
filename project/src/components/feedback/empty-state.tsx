import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon = Inbox, title, description, children, className }: { icon?: LucideIcon; title: string; description: string; children?: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-52 flex-col items-center justify-center px-6 py-12 text-center", className)}><Icon className="mb-5 size-8 text-muted-foreground" strokeWidth={1.5} /><h2 className="text-base font-medium">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{children && <div className="mt-5">{children}</div>}</div>;
}
