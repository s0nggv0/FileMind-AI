import Link from "next/link";
import { ArrowUpRight, GitBranch } from "lucide-react";
import { DocumentTypeIcon } from "@/components/common/document-type-icon";
import { EmptyState } from "@/components/feedback/empty-state";
import { formatDocumentDate } from "@/features/library/document-presentation";
import type { DemoDocument } from "@/types";

export function RecentFiles({ documents }: { documents: DemoDocument[] }) {
  return (
    <section aria-labelledby="recent-files-heading">
      <div className="mb-4 flex items-center justify-between"><h2 id="recent-files-heading" className="text-sm font-semibold">最近文件</h2><Link href="/library" className="flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">查看资料库 <ArrowUpRight size={13} /></Link></div>
      {documents.length ? <ul className="border-t">{documents.map((document) => <li key={document.id} className="border-b"><Link href={`/library?document=${document.id}`} className="surface-interactive flex items-start gap-3 px-2 py-4" aria-label={`查看 ${document.name}`}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-interactive bg-muted"><DocumentTypeIcon type={document.type} /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{document.name}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span className="font-mono">{document.type.toUpperCase()}</span><span>{document.category}</span><time dateTime={document.updatedAt}>更新于 {formatDocumentDate(document.updatedAt)}</time></div></div>
        <span className="flex shrink-0 items-center gap-1 pt-1 text-xs text-muted-foreground" aria-label={`${document.relations} 条关联`}><GitBranch size={13} />{document.relations}</span>
      </Link></li>)}</ul> : <EmptyState title="还没有资料" description="从工作台添加文件，开始建立你的知识空间。" />}
    </section>
  );
}
