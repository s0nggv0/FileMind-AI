import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <main className="flex min-h-dvh items-center justify-center"><EmptyState title="这个页面还没有内容" description="回到工作空间，继续探索你的资料。"><Button asChild><Link href="/workspace"><ArrowLeft />回到工作空间</Link></Button></EmptyState></main>;
}
