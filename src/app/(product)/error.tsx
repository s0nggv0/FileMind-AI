"use client";

import { ErrorState } from "@/components/feedback/error-state";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <div className="space-y-5"><ErrorState title="这个页面暂时无法打开" description="页面加载中断，请重试。提交中的操作可以在 Settings 查看恢复状态。" onRetry={retry} /><div className="flex flex-wrap justify-center gap-3"><Button size="sm" variant="outline" onClick={()=>window.history.back()}>返回上一页</Button><Button size="sm" variant="outline" asChild><Link href="/dashboard">Dashboard</Link></Button><Button size="sm" variant="ghost" asChild><Link href="/settings">查看维护状态</Link></Button></div></div>;
}
