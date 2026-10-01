import { Orbit } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return <div className={cn("flex items-center gap-2.5", className)}><Orbit className="size-7 text-primary" strokeWidth={1.7} /><div><span className="text-lg font-semibold tracking-tight">FileMind<span className="ml-1 font-normal text-muted-foreground">AI</span></span><p className="mt-0.5 text-[11px] tracking-wider text-muted-foreground">知序 · 个人知识空间</p></div></div>;
}
