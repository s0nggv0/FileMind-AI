const categories: Record<string, string> = {
  "Artificial Intelligence": "人工智能",
  Study: "学习",
  Learning: "学习",
  Projects: "项目",
  Research: "研究",
  Images: "图片",
  Reference: "参考资料",
  Uncategorized: "未分类",
};

const states: Record<string, string> = {
  pending: "待处理", queued: "排队中", processing: "处理中", running: "执行中",
  planning: "规划中", completed: "已完成", failed: "失败", skipped: "已跳过",
  cancelled: "已取消", ready: "已就绪", unavailable: "不可用", not_analyzed: "未分析",
  high: "高", medium: "中", low: "低",
};

const tools: Record<string, string> = {
  read_document: "读取资料", analyze_document: "分析资料", analyze_image: "分析图片",
  summarize_document: "生成摘要", classify_document: "分类资料", generate_tags: "生成标签",
  generate_filename: "建议文件名",
  detect_duplicates: "检测重复", build_relationships: "建立关联",
  generate_organization_plan: "生成整理方案",
};

export function categoryLabel(value: string) { return categories[value] ?? value; }
export function stateLabel(value: string) { return states[value] ?? value; }
export function toolLabel(value: string) { return tools[value] ?? value; }

const messages: Record<string, string> = {
  "Searching your knowledge": "正在搜索资料",
  "Generating answer": "正在生成回答",
  "Checking claims and conflicting sources": "正在核对事实与冲突来源",
  "AI service credentials need attention.": "请检查 AI 服务密钥配置。",
  "AI service is busy. Retry shortly.": "AI 服务繁忙，请稍后重试。",
  "Document exceeds the AI input limit.": "资料超过 AI 输入长度限制。",
  "AI analysis timed out. You can retry.": "AI 分析超时，可以重试。",
  "AI returned an invalid result. You can retry.": "AI 返回的结果格式无效，可以重试。",
  "AI service is temporarily unavailable.": "AI 服务暂时不可用，请稍后重试。",
  "AI analysis unavailable — using basic local organization.": "AI 分析不可用，当前使用本地规则整理。",
  "AI plan unavailable — using a deterministic proposal from document analyses.": "AI 规划不可用，当前根据资料分析结果按规则生成方案。",
  "AI plan unavailable · using a deterministic proposal from document analyses": "AI 规划不可用，当前根据资料分析结果按规则生成方案。",
  "FileMind Intelligence · planning with AI tool calls": "AI 整理助手正在规划工具调用",
  "Proposal ready · AI proposes, you decide": "整理建议已就绪，等待你审阅",
  "Run interrupted or cancelled · no background execution": "整理已中断或取消，不会在后台继续执行",
  "Exact duplicate · identical SHA-256 file hash": "文件完全相同 · SHA-256 校验和一致",
  "Text duplicate · identical normalized full text": "正文相同 · 规范化后的完整正文一致",
  "Name similarity · potential match, not semantic similarity": "名称相似 · 重复候选，未进行语义相似度判断",
  "Image metadata captured locally. Image content has not been analyzed.": "已在本地读取图片信息，尚未分析图片内容。",
};

// 只转换系统提示，保留资料原文和模型回答。
export function systemMessage(value: string) {
  if (messages[value]) return messages[value];
  const prefixes: [string, string][] = [
    ["Extracted excerpt: ", "正文摘录："], ["Image knowledge: ", "图片知识："],
    ["Shared concept: ", "共同概念："], ["Shared category: ", "共同分类："],
  ];
  for (const [prefix, label] of prefixes) {
    if (value.startsWith(prefix)) {
      const content = value.slice(prefix.length);
      return label + (prefix === "Shared category: " ? categoryLabel(content) : content);
    }
  }
  for (const [name, label] of Object.entries(tools)) {
    const description = name.replaceAll("_", " ");
    if (value === description || value.startsWith(`${description} · `)) return label + value.slice(description.length);
  }
  return value;
}
