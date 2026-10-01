import type { DashboardInsight } from "@/types/presentation";
import { demoDocuments } from "./documents";
import { demoCleanupIssues } from "./cleanup";
import { demoGraphEdges } from "./graph";

export const dashboardInsights: DashboardInsight[] = [
  {
    id: "growth", kind: "growth", title: `${demoDocuments.length} 份资料，已构成一个知识空间。`,
    description: "课程笔记、研究文献与项目记录，都可以从这里继续探索。", href: "/library",
  },
  {
    id: "overlap", kind: "overlap", title: "2 份课程资料可能包含重叠内容。",
    description: demoCleanupIssues[0].description, href: "/cleanup",
  },
  {
    id: "connections", kind: "connection", title: `${demoGraphEdges.length} 条关联，连接文档与核心概念。`,
    description: "从 RAG、机器学习和知识管理展开，发现值得一起阅读的资料。", href: "/graph",
  },
  {
    id: "review", kind: "review", title: `${demoCleanupIssues.length} 项整理建议，等待你的决定。`,
    description: "对照章节、同步项目决策、补充主题标签。每一步都由你确认。", href: "/workspace",
  },
];

export const dashboardActivityGroups = [
  { label: "Today", date: "09.30", items: [
    { id: "project", title: "更新项目计划", detail: "AI Web 挑战赛项目计划.docx", time: "14:45", href: "/library?document=doc-project-proposal" },
    { id: "notes", title: "课程资料已就绪", detail: "人工智能课程笔记.pdf", time: "08:30", href: "/library?document=doc-ai-course" },
  ] },
  { label: "Yesterday", date: "09.29", items: [
    { id: "research", title: "添加研究笔记", detail: "RAG 文献阅读.md · 3 条关联", time: "16:20", href: "/library?document=doc-rag-research" },
  ] },
];

export const dashboardTopics = ["人工智能", "机器学习", "RAG", "FileMind", "知识管理"].map((name) => {
  const files = demoDocuments.filter((document) => document.tags.includes(name));
  return { name, count: files.length, documentId: files[0]?.id };
});

export const dashboardQuickActions = [
  { label: "Organize files", description: "让资料开始有序", href: "/workspace", icon: "organize" as const },
  { label: "Ask your knowledge", description: "从一个问题开始", href: "/search", icon: "search" as const },
  { label: "Explore connections", description: "沿着关联继续阅读", href: "/graph", icon: "graph" as const },
];
