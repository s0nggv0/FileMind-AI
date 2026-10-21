import { realAIRequired } from "@/lib/competition";
import { PageHeader } from "@/components/common/page-header";
import { Reveal } from "@/components/motion/reveal";
import { KnowledgeSearch } from "@/features/search/knowledge-search";
import { persistenceConfigured } from "@/lib/server/database";
import { getUserId } from "@/lib/server/identity";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await getUserId();
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : undefined;
  return <Reveal className="space-y-5"><PageHeader title="搜索资料" description="提问或查找正文，核对原始依据。" /><KnowledgeSearch key={[value("workspace"), value("document"), value("run"), value("q")].join(":")} initialWorkspace={value("workspace")} initialDocument={value("document")} initialQuery={value("q")} initialMode={value("mode") === "find" ? "find" : "ask"} persistent={persistenceConfigured()} mock={!realAIRequired()} /></Reveal>;
}
