import { PageHeader } from "@/components/common/page-header";
import { Reveal } from "@/components/motion/reveal";
import { KnowledgeSearch } from "@/features/search/knowledge-search";
import { persistenceConfigured } from "@/lib/server/database";
import { getUserId } from "@/lib/server/identity";

export default async function SearchPage() {
  await getUserId();
  return <Reveal className="space-y-7"><PageHeader title="从一句问题，回到原始资料。" description="检索你的知识库，用原文核对每个回答。" /><KnowledgeSearch persistent={persistenceConfigured()} mock={process.env.AI_ENGINE === "mock" || process.env.EMBEDDING_PROVIDER === "mock"} /></Reveal>;
}
