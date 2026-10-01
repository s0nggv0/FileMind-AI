import type { DemoWorkspaceStep } from "@/types";

export const demoWorkspaceSteps: DemoWorkspaceStep[] = [
  { id: "step-read", label: "读取与解析", tool: "Document Parser" },
  { id: "step-understand", label: "理解文档内容", tool: "Content Analyzer" },
  { id: "step-organize", label: "生成整理建议", tool: "Organization Planner" },
  { id: "step-review", label: "等待你的确认", tool: "Review Gate" },
];
