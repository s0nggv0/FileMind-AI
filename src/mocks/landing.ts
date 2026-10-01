import type { AgentStage, CleanupComparison, LandingFile, RelationshipEdge, RelationshipNode } from "@/types/presentation";

export const landingNavigation = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
];

export const landingFormats = ["PDF", "DOCX", "Markdown", "TXT", "Images"];

export const agentStages: AgentStage[] = [
  { label: "Drop your files", activity: "Waiting for your documents", detail: "从一叠散落的资料开始。" },
  { label: "12 files added", activity: "Reading research-paper.pdf", detail: "读取资料，保留每个文件的来源。" },
  { label: "Understanding documents", activity: "Analyzing machine-learning-notes.docx", detail: "理解内容，而不只是文件名。" },
  { label: "Detecting topics", activity: "Classifying notes into 4 topics", detail: "把课程、研究与项目分门别类。" },
  { label: "Finding relationships", activity: "Connecting Transformer ↔ Attention", detail: "让相近的知识彼此连接。" },
  { label: "Building knowledge space", activity: "Found 2 similar documents", detail: "整理建议等待你的确认。" },
  { label: "Organized", activity: "Your knowledge space is ready", detail: "文件有了秩序，知识有了联系。" },
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
  query: "Where did I learn about attention mechanisms?",
  results: [
    { name: "Transformer Notes", excerpt: "Self-attention connects every token to its context.", type: "pdf" as const },
    { name: "Attention Is All You Need", excerpt: "An architecture built around attention mechanisms.", type: "pdf" as const },
    { name: "NLP Lecture", excerpt: "From recurrent networks to multi-head attention.", type: "md" as const },
  ],
};

export const landingGraphNodes: RelationshipNode[] = [
  { id: "transformer", label: "Transformer", x: 45, y: 43, mobile: true },
  { id: "attention", label: "Attention", x: 75, y: 25, mobile: true },
  { id: "bert", label: "BERT", x: 77, y: 65, mobile: true },
  { id: "nlp", label: "NLP Notes", x: 45, y: 13, mobile: true },
  { id: "ml", label: "Machine Learning", x: 20, y: 71 },
  { id: "dl", label: "Deep Learning", x: 45, y: 89 },
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
  { label: "Drop", description: "放入散落的文档", detail: "PDF、笔记、截图与项目资料" },
  { label: "Understand", description: "理解文件的内容", detail: "读取正文，识别概念与主题" },
  { label: "Organize", description: "Agent 提出整理建议", detail: "分类、标签、命名与重复检测" },
  { label: "Connect", description: "建立语义联系", detail: "RAG 与 Embeddings 连接知识" },
  { label: "Explore", description: "探索你的知识空间", detail: "自然语言搜索与关联阅读" },
];
