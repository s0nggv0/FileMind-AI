import type { ParsedDocument } from "@/types/workspace";
import type { AIProvider, AIUsage } from "./provider";
import { DocumentAnalysisSchema } from "./schemas";
import { guardDocumentText, sanitizeFilename, shouldSuggestFilename, untrustedData } from "./input-guard";
import { DOCUMENT_PROMPT_VERSION, documentAnalysisPrompt } from "./prompts/document-analysis";
import { aiLimits } from "./config";
import { normalizeAIError } from "./errors";
export async function analyzeDocument(provider: AIProvider, document: ParsedDocument, text: string, existingCategories: string[], signal: AbortSignal, recordUsage: (usage: AIUsage) => void) {
  const guarded = guardDocumentText(text);
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await provider.generateObject({ role: "small", system: documentAnalysisPrompt, prompt: untrustedData({ documentId: document.id, documentName: document.name, content: guarded.text, sampled: guarded.sampled, existingCategories, metadata: document.metadata, type: document.type, promptVersion: DOCUMENT_PROMPT_VERSION }), schema: DocumentAnalysisSchema, signal });
      recordUsage(result.usage); const value = DocumentAnalysisSchema.parse(result.object);
      value.tags = [...new Map(value.tags.map(tag => tag.trim()).filter(tag => tag && !/^(document|file|information)$/i.test(tag)).map(tag => [tag.normalize("NFKC").toLocaleLowerCase(), tag])).values()].slice(0, 5);
      if (!existingCategories.includes(value.category) && !value.isNewCategory) value.category = "Other";
      if (!shouldSuggestFilename(document.name) || !value.filenameSuggestion.suggestedFilename) value.filenameSuggestion = { shouldRename: false, suggestedFilename: null, reason: "Keep the original meaningful filename." };
      else value.filenameSuggestion.suggestedFilename = sanitizeFilename(value.filenameSuggestion.suggestedFilename, document.name);
      return value;
    } catch (error) { signal.throwIfAborted(); const normalized = normalizeAIError(error, provider.name); if (attempt >= aiLimits.maxToolRetries || !normalized.retryable) throw normalized; }
  }
}
