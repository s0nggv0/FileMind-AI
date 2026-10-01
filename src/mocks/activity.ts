import type { DemoActivity } from "@/types";

export const demoActivities: DemoActivity[] = [
  {
    id: "activity-import",
    title: "示例文档已就绪",
    description: "6 份课程、研究与项目资料，供你体验文件库与知识关联。",
    time: "今天 09:20",
    status: "completed",
  },
  {
    id: "activity-relation",
    title: "探索文档之间的联系",
    description: "从 RAG、机器学习和知识管理三个概念展开阅读。",
    time: "今天 09:15",
    status: "completed",
  },
  {
    id: "activity-review",
    title: "整理建议等待审阅",
    description: "示例空间中有 3 项待审阅建议，可查看处理方式。",
    time: "今天 09:10",
    status: "pending",
  },
];
