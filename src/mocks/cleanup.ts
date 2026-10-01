import type { DemoCleanupIssue } from "@/types";

export const demoCleanupIssues: DemoCleanupIssue[] = [
  {
    id: "cleanup-overlap",
    type: "duplicate",
    title: "内容可能重叠",
    description: "两份课程资料均包含模型评估内容。建议先对照章节，再决定是否保留两份。",
    files: ["人工智能课程笔记.pdf", "机器学习实验报告.pdf"],
    recommendation: "审阅重叠章节，保留各自独有的笔记和实验结果。",
    preview: {
      label: "审阅状态",
      before: "模型评估章节尚未对照",
      after: "标记为待对照，审阅后决定保留方式",
    },
  },
  {
    id: "cleanup-outdated",
    type: "outdated",
    title: "项目决策需要同步",
    description: "讨论记录中的待办事项可能需要与最新项目计划对齐。",
    files: ["项目讨论记录.txt", "AI Web 挑战赛项目计划.docx"],
    recommendation: "对照项目计划，标记已经完成或调整的事项。",
    preview: {
      label: "审阅状态",
      before: "讨论待办尚未与最新计划同步",
      after: "标记为待同步，审阅后更新待办状态",
    },
  },
  {
    id: "cleanup-tags",
    type: "missing-tags",
    title: "可以补充主题标签",
    description: "架构草图可补充“语义检索”标签，便于与相关研究资料关联。",
    files: ["知识管理架构草图.png"],
    recommendation: "审阅后添加“语义检索”标签。",
    preview: {
      label: "主题标签",
      before: "知识管理、架构设计、FileMind",
      after: "知识管理、架构设计、FileMind、语义检索",
    },
  },
];
