import { z } from "zod";
import type { SearchResult } from "./search-contract";

// Public, version-independent outcomes. Never derive these from error messages.
export const SearchIssueSchema = z.enum([
  "PREPARATION_INCOMPLETE", "NO_RELEVANT_CONTENT", "MISSING_REQUESTED_FACTS",
  "VERIFICATION_FAILED", "ANSWER_SERVICE_UNAVAILABLE", "SOURCES_CHANGED",
  "INSUFFICIENT_EVIDENCE", "SEARCH_UNAVAILABLE", "HISTORY_UNVERIFIED", "SEMANTIC_UNAVAILABLE",
]);
export type SearchIssue = z.infer<typeof SearchIssueSchema>;
export type SearchRecovery = "prepare" | "edit" | "sources" | "retry";

export const searchIssueCopy: Record<SearchIssue, { title: string; description: string; actions: SearchRecovery[] }> = {
  PREPARATION_INCOMPLETE: { title: "部分资料尚未准备完成", description: "当前范围内有资料尚不可按内容搜索，本次结果可能不完整。可以先准备未完成资料，完成后再手动搜索。", actions: ["prepare", "retry"] },
  NO_RELEVANT_CONTENT: { title: "没有召回足够相关的内容", description: "本次在当前范围内未找到可用于回答的相关片段。可以补充资料中的名称、关键词，或调整问题；这不代表全部原文都没有答案。", actions: ["edit", "sources", "retry"] },
  MISSING_REQUESTED_FACTS: { title: "相关内容缺少问题要求的事实", description: "已找到相关内容，但本次证据不足以支持问题要求的事实。可以查看原文，或把问题改为资料中已说明的内容。", actions: ["sources", "edit"] },
  VERIFICATION_FAILED: { title: "生成回答未通过事实验证", description: "本次生成内容未能全部通过原文依据检查，因此未展示回答。这不能说明资料中没有答案；相关片段仍可核对。", actions: ["sources", "retry", "edit"] },
  ANSWER_SERVICE_UNAVAILABLE: { title: "回答生成或验证服务暂不可用", description: "本次未能完成回答生成或事实验证，不能据此判断资料是否包含答案。可以先查看相关原文，稍后手动重试。", actions: ["sources", "retry"] },
  SOURCES_CHANGED: { title: "来源已经变化或失效", description: "部分来源已变化或无法访问。已保存的结果仅反映搜索当时的资料，请在相同范围重新搜索以核对当前内容。", actions: ["retry", "sources"] },
  INSUFFICIENT_EVIDENCE: { title: "本次依据不足，未能给出答案", description: "目前无法可靠判断是内容不够相关，还是缺少所需事实。可以核对相关原文、补充具体名称后再次提问。", actions: ["sources", "edit", "retry"] },
  SEARCH_UNAVAILABLE: { title: "本次搜索未完成", description: "暂时无法确认具体原因。已有结果仍保留，可以稍后在当前范围手动重试。", actions: ["retry", "edit"] },
  HISTORY_UNVERIFIED: { title: "这条历史记录缺少事实验证信息", description: "无法确认旧回答是否通过事实验证，因此不展示其回答正文。保存的片段仍可查看，可在原范围重新搜索。", actions: ["sources", "retry"] },
  SEMANTIC_UNAVAILABLE: { title: "已降级为关键词检索", description: "语义搜索暂时不可用，本次使用关键词检索，可能遗漏相近表达。已有结果保留，可以用原文中的词语调整问题，或稍后手动重试。", actions: ["edit", "retry"] },
};

export function searchIssues(result: SearchResult): SearchIssue[] {
  const issues = new Set<SearchIssue>((result.issues ?? []).map(issue => {
    const parsed = SearchIssueSchema.safeParse(issue);
    return parsed.success ? parsed.data : "SEARCH_UNAVAILABLE";
  }));
  // Old records must not acquire new factual conclusions or a verified status.
  if (result.mode === "ask") {
    if (!result.verification && result.answer) issues.add("HISTORY_UNVERIFIED");
    else if (result.issues === undefined) {
      if (result.verification?.status === "rejected") issues.add("VERIFICATION_FAILED");
      else if (result.verification?.status === "unavailable" || result.answerUnavailable) issues.add("ANSWER_SERVICE_UNAVAILABLE");
      else if (result.verification?.status === "no_answer") issues.add("INSUFFICIENT_EVIDENCE");
    }
  }
  if (result.semanticUnavailable) issues.add("SEMANTIC_UNAVAILABLE");
  return [...issues];
}

export function hasVerifiedAnswer(result: SearchResult) {
  return !!result.answer && !result.answer.insufficientEvidence &&
    (result.verification?.status === "verified" || result.verification?.status === "conflict");
}
