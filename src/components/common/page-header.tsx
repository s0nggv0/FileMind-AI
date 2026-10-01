import type { ReactNode } from "react";

export function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0"><h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p></div>
    {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
  </div>;
}
