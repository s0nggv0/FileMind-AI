import Link from "next/link";
import { ArrowDownLeft, ArrowRight, FileText, FolderOpen, Network, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDocumentDate } from "@/features/library/document-presentation";
import type { DemoActivity, DemoDocument } from "@/types";

type OverviewProps = {
  overview: { fileCount: number; categoryCount: number; relationCount: number; pendingCount: number };
  documents: DemoDocument[];
  activities: DemoActivity[];
};

export function Overview({ overview, documents, activities }: OverviewProps) {
  const metrics = [
    { label: "示例资料", value: overview.fileCount, suffix: "份" },
    { label: "内容分类", value: overview.categoryCount, suffix: "个" },
    { label: "知识关联", value: overview.relationCount, suffix: "条" },
    { label: "待审阅建议", value: overview.pendingCount, suffix: "项" },
  ];

  return (
    <div className="space-y-9">
      <div className="grid gap-5 border-y border-border py-6 sm:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-3xl font-medium tracking-tight">{metric.value}<span className="ml-2 text-sm font-normal text-muted-foreground">{metric.suffix}</span></p>
          </div>
        ))}
      </div>

      <section className="grid gap-8 rounded-2xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col items-start justify-center">
          <div className="mb-6 flex items-center gap-2 text-xs font-medium text-primary"><Sparkles size={15} /> AI WORKSPACE</div>
          <h2 className="max-w-md text-3xl font-medium leading-tight tracking-tight sm:text-4xl">从散落的资料，<br />开始建立知识秩序。</h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">先把文件放进工作台，再逐步看清内容、分类与关联。每一步整理，都由你审阅决定。</p>
          <Button asChild className="mt-7"><Link href="/workspace">打开工作台 <ArrowRight size={16} /></Link></Button>
        </div>
        <div className="flex min-h-56 items-center justify-center rounded-xl bg-muted/50 p-6" aria-label="整理流程示意">
          <div className="w-full max-w-xs space-y-3">
            {documents.slice(0, 3).map((document, index) => (
              <div key={document.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3" style={{ marginLeft: `${index * 14}px` }}>
                <FileText size={18} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{document.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{document.category}</p></div>
                <ArrowDownLeft size={14} className="text-primary" />
              </div>
            ))}
            <p className="pt-2 text-center text-[11px] text-muted-foreground">文件 → 内容 → 关联 · 流程预览</p>
          </div>
        </div>
      </section>

      <div className="grid gap-9 xl:grid-cols-[1.35fr_1fr]">
        <section>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">最近的示例资料</h2><Link href="/library" className="text-xs text-muted-foreground hover:text-foreground">查看全部 <span aria-hidden="true">↗</span></Link></div>
          <div className="divide-y divide-border">
            {documents.slice(0, 4).map((document) => (
              <Link key={document.id} href="/library" className="group flex items-center gap-4 py-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><FileText size={18} className="text-muted-foreground" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium group-hover:text-primary">{document.name}</p><p className="mt-1 text-xs text-muted-foreground">{document.category} · {formatDocumentDate(document.updatedAt)}</p></div>
                <Badge variant="outline" className="hidden uppercase sm:inline-flex">{document.type}</Badge>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-4 text-sm font-semibold">工作空间动态</h2>
          <div className="space-y-5 border-l border-border pl-5">
            {activities.slice(0, 3).map((activity) => (
              <div key={activity.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-primary/70" />
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{activity.title}</p><span className="text-[11px] text-muted-foreground">{activity.time}</span></div>
                <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{activity.description}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[11px] text-muted-foreground">以上为预置演示记录。</p>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { title: "自然语言寻找答案", text: "查看带出处的检索界面", href: "/search", icon: Search },
          { title: "沿着关联继续探索", text: "查看文件与概念的连接", href: "/graph", icon: Network },
          { title: "留住有用的资料", text: "审阅整理建议的界面", href: "/cleanup", icon: FolderOpen },
        ].map(({ title, text, href, icon: Icon }) => (
          <Link key={href} href={href} className="group flex gap-3 rounded-xl border border-border p-5 transition-colors hover:bg-muted/50">
            <Icon size={19} className="mt-0.5 shrink-0 text-primary" />
            <div><p className="text-sm font-medium">{title}</p><p className="mt-1.5 text-xs text-muted-foreground">{text}</p></div>
            <ArrowRight size={15} className="ml-auto shrink-0 text-muted-foreground group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}
