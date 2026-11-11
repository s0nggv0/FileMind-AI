"use client";

import { TriangleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({ title = "暂时无法加载", description = "数据没有丢失。请重试，或返回工作空间继续。", onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return <div role="alert" className="flex min-h-52 flex-col items-center justify-center p-8 text-center"><TriangleAlert className="mb-4 size-7 text-destructive" /><h2 className="font-medium">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{onRetry && <Button variant="outline" className="mt-5" onClick={onRetry}><RotateCcw />重新加载</Button>}</div>;
}
