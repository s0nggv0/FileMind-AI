import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { SessionLibrary } from "@/features/workspace/components/session-results";
import { getDemoDocuments, getDemoCategories } from "@/services/demo-repository";
import { getWorkspacePresentation } from "@/lib/server/workspace-presentation";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ document?: string | string[]; source?: string }> }) {
  const params = await searchParams;
  const saved = await getWorkspacePresentation();
  const initialSelectedId = typeof params.document === "string" ? params.document : undefined;
  return <Reveal className="space-y-7"><PageHeader title="所有资料，井然有序。" description="浏览、筛选与查看内容。在一个地方，保留你的知识积累。"><Button asChild size="sm"><Link href="/workspace"><Plus size={15} /> 导入资料</Link></Button></PageHeader><DemoNote>{saved.persistent ? "私有工作区资料 · 从服务器恢复已保存资料，示例数据单独标记。" : "仅本地演示 · 刷新后清空当前会话，可以切换示例资料。"}</DemoNote><SessionLibrary key={`${params.source}-${initialSelectedId}`} preferSession={saved.persistent || params.source === "workspace"} persistentDocuments={saved.documents} persistent={saved.persistent} documents={getDemoDocuments()} categories={getDemoCategories()} initialSelectedId={initialSelectedId} /></Reveal>;
}
