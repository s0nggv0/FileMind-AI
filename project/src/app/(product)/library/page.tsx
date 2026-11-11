import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { SessionLibrary } from "@/features/workspace/components/session-results";
import { getDemoDocuments, getDemoCategories } from "@/lib/demo/repository";
import { getLibraryDocuments } from "@/lib/server/workspace-presentation";
import { LIBRARY_DOCUMENT_LIMIT } from "@/lib/workspace/presentation-limits";
import { z } from "zod";
import { parseCitationAnchor, type CitationAnchor } from "@/lib/retrieval/citation-contract";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const saved = await getLibraryDocuments();
  const initialSelectedId = typeof params.document === "string" ? params.document : undefined;
  let citation: CitationAnchor | undefined, citationInvalid = false;
  if (params.chunkId) {
    try {
      citation = parseCitationAnchor(new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")));
      if (citation.documentId !== initialSelectedId) { citation = undefined; citationInvalid = true; }
    } catch { citationInvalid = true; }
  }
  const run = z.uuid().safeParse(params.run), runId = run.success ? run.data : undefined;
  return <Reveal className="space-y-7"><PageHeader title="资料库" description="阅读原件和提取全文，修正分类与标签。"><Button asChild size="sm"><Link href="/workspace"><Plus size={15} /> 导入资料</Link></Button></PageHeader><DemoNote>{saved.persistent ? "私有工作区资料 · 从服务器恢复已保存资料，示例数据单独标记。" : "仅本地演示 · 刷新后清空当前会话，可以切换示例资料。"}</DemoNote>{saved.totalDocuments > LIBRARY_DOCUMENT_LIMIT && <p className="text-xs text-muted-foreground">当前列表及筛选仅覆盖最近导入的 {LIBRARY_DOCUMENT_LIMIT} 份资料（共 {saved.totalDocuments} 份），暂不分页。较早资料仍保留，可通过搜索结果或资料链接打开。</p>}<SessionLibrary key={`${params.source}-${initialSelectedId}-${citation?.chunkId}-${citation?.textVersion}`} preferSession={saved.persistent || params.source === "workspace"} persistentDocuments={saved.documents} persistent={saved.persistent} documents={getDemoDocuments()} categories={getDemoCategories()} initialSelectedId={initialSelectedId} citation={citation} citationInvalid={citationInvalid} runId={runId} /></Reveal>;
}
