import { LoaderCircle } from "lucide-react";

export function LoadingState({ label = "正在加载知识空间…" }: { label?: string }) {
  return <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-14 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />{label}</div>;
}
