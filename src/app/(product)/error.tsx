"use client";

import { ErrorState } from "@/components/feedback/error-state";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="这个页面暂时无法打开" description="请重新加载页面。当前演示不涉及真实文件，不会影响你的本地资料。" onRetry={reset} />;
}
