import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return <div role="status" aria-label="正在加载页面" className="content-width space-y-8"><div className="space-y-3"><Skeleton className="h-9 w-48" /><Skeleton className="h-5 w-3/4 max-w-lg" /></div><Skeleton className="h-44 w-full rounded-xl" /><div className="space-y-4">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-4"><Skeleton className="size-11 shrink-0" /><div className="w-full space-y-2"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-3 w-3/5" /></div></div>)}</div><span className="sr-only">正在加载，请稍候。</span></div>;
}
