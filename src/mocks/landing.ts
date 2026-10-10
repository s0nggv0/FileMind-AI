import type { AgentStage, CleanupComparison, LandingFile, RelationshipEdge, RelationshipNode } from "@/types/presentation";

export const landingNavigation = [
  { label: "产品介绍", href: "#product" },
  { label: "使用流程", href: "#how-it-works" },
  { label: "功能", href: "#features" },
];

export const landingFormats = ["PDF", "DOCX", "Markdown", "TXT", "图片"];

export const agentStages: AgentStage[] = [
  { label: "导入文件", activity: "等待导入资料", detail: "从一叠散落的资料开始。" },
  { label: "已添加 12 份文件", activity: "正在读取 research-paper.pdf", detail: "读取资料，保留每个文件的来源。" },
  { label: "正在分析资料", activity: "正在分析 machine-learning-notes.docx", detail: "理解内容，而不只是文件名。" },
  { label: "正在识别主题", activity: "正在将笔记分为 4 个主题", detail: "把课程、研究与项目分门别类。" },
  { label: "正在查找关联", activity: "正在关联 Transformer 与注意力机制", detail: "让相近的知识彼此连接。" },
  { label: "正在建立知识空间", activity: "发现 2 份相似资料", detail: "整理建议等待你的确认。" },
  { label: "整理完成", activity: "知识空间已就绪", detail: "文件有了秩序，知识有了联系。" },
];

export const landingFiles: LandingFile[] = [
  { name: "research-paper.pdf", type: "pdf", category: "Research" },
  { name: "machine-learning-notes.docx", type: "docx", category: "Learning" },
  { name: "attention-diagram.png", type: "image", category: "Research" },
  { name: "NLP-lecture.md", type: "md", category: "Learning" },
  { name: "AI-Web-Project.docx", type: "docx", category: "Projects" },
  { name: "team-notes.txt", type: "txt", category: "Projects" },
  { name: "Research-final.docx", type: "docx", category: "Research" },
  { name: "Research-final-v2.docx", type: "docx", category: "Research" },
  { name: "Linear-Algebra-Notes.png", type: "image", category: "Learning" },
  { name: "reading-list.md", type: "md", category: "Reference" },
  { name: "Deep-Learning.pdf", type: "pdf", category: "Learning" },
  { name: "bibliography.txt", type: "txt", category: "Reference" },
];

export const organizeExamples = [
  { before: "IMG_1292.png", after: "Linear-Algebra-Notes.png", type: "image" as const },
  { before: "未命名.pdf", after: "Transformer-Paper.pdf", type: "pdf" as const },
  { before: "final2.docx", after: "AI-Web-Project.docx", type: "docx" as const },
];

export const semanticExample = {
  query: "哪些资料讲过注意力机制？",
  results: [
    { name: "Transformer 笔记", excerpt: "自注意力机制将每个词元与上下文联系起来。", type: "pdf" as const },
    { name: "Attention Is All You Need", excerpt: "以注意力机制为核心的模型架构。", type: "pdf" as const },
    { name: "自然语言处理课程", excerpt: "从循环神经网络到多头注意力机制。", type: "md" as const },
  ],
};

export const landingGraphNodes: RelationshipNode[] = [
  { id: "transformer", label: "Transformer", x: 45, y: 43, mobile: true },
  { id: "attention", label: "注意力机制", x: 75, y: 25, mobile: true },
  { id: "bert", label: "BERT", x: 77, y: 65, mobile: true },
  { id: "nlp", label: "自然语言处理笔记", x: 45, y: 13, mobile: true },
  { id: "ml", label: "机器学习", x: 20, y: 71 },
  { id: "dl", label: "深度学习", x: 45, y: 89 },
];

export const landingGraphEdges: RelationshipEdge[] = [
  { source: "transformer", target: "attention" },
  { source: "transformer", target: "bert" },
  { source: "attention", target: "nlp" },
  { source: "ml", target: "dl" },
];

export const agentConnections = landingGraphEdges.slice(0, 3);

export const cleanupComparison: CleanupComparison = {
  original: "Research-final.docx",
  updated: "Research-final-v2.docx",
  similarity: 96,
  addedWords: 326,
  addedReferences: 4,
  before: "实验方法与初步结论；参考文献共 8 篇。",
  after: "补充消融实验、局限性说明与 4 篇参考文献；新增 326 词。",
};

export const workflowSteps = [
  { label: "导入", description: "放入散落的文档", detail: "PDF、笔记、截图与项目资料" },
  { label: "分析", description: "理解文件的内容", detail: "读取正文，识别概念与主题" },
  { label: "整理", description: "AI 整理助手提出建议", detail: "分类、标签、命名与重复检测" },
  { label: "关联", description: "建立语义联系", detail: "检索增强生成与向量索引连接知识" },
  { label: "探索", description: "探索你的知识空间", detail: "自然语言搜索与关联阅读" },
];
