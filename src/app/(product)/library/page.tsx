import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { LibraryBrowser } from "@/features/library/library-browser";
import { getDemoDocuments, getDemoCategories } from "@/services/demo-repository";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ document?: string | string[] }> }) {
  const params = await searchParams;
  const initialSelectedId = typeof params.document === "string" ? params.document : undefined;
  return <Reveal className="space-y-7"><PageHeader title="所有资料，井然有序。" description="浏览、筛选与查看内容。在一个地方，保留你的知识积累。"><Button asChild size="sm"><Link href="/workspace"><Plus size={15} /> 导入资料</Link></Button></PageHeader><DemoNote /><LibraryBrowser key={initialSelectedId ?? "library"} documents={getDemoDocuments()} categories={getDemoCategories()} initialSelectedId={initialSelectedId} /></Reveal>;
}
