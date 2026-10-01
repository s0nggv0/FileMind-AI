import { PageHeader } from "@/components/common/page-header";
import { DemoNote } from "@/components/common/demo-note";
import { Reveal } from "@/components/motion/reveal";
import { SearchPreview } from "@/features/search/search-preview";
import { getDemoDocuments, getDemoSearchSuggestions } from "@/services/demo-repository";

export default function SearchPage() {
  return <Reveal className="space-y-7"><PageHeader title="从一句问题，回到原始资料。" description="用自然语言探索知识，让答案与来源始终在一起。" /><DemoNote>检索界面预览 · 未接入 Embedding、向量检索或 AI 回答。</DemoNote><SearchPreview suggestions={getDemoSearchSuggestions()} documents={getDemoDocuments()} /></Reveal>;
}
