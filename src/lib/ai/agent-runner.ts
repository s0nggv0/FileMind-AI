import { tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import type { AgentRun, AgentStep, AgentTool, OrganizationPlan, ParsedDocument } from "@/types/workspace";
import type { WorkspaceSnapshot } from "@/lib/workspace/schemas";
import { OrganizationProposalSchema } from "@/lib/workspace/schemas";
import { WorkspaceError } from "@/lib/workspace/authorization";
import { buildOrganizationPlan, buildRelationships, detectDuplicates } from "@/features/workspace/services/organization-rules";
import type { AIProvider, AIUsage } from "./provider";
import { analyzeDocument } from "./document-analysis";
import { analysisQueue } from "./analysis-queue";
import { aiLimits, defaultCategories } from "./config";
import { AIError, normalizeAIError } from "./errors";
import { untrustedData } from "./input-guard";
import { agentPlannerPrompt, PLANNER_PROMPT_VERSION } from "./prompts/agent-planner";
import { documentAnalysisPrompt, DOCUMENT_PROMPT_VERSION } from "./prompts/document-analysis";
import { ORGANIZATION_PROMPT_VERSION, organizationPlanPrompt } from "./prompts/organization-plan";
import { DocumentAnalysisSchema, OrganizationOutputSchema, type DocumentAnalysis } from "./schemas";
import { ToolRegistry } from "./tool-registry";

export interface AnalysisCache { get(key: string): Promise<unknown>; set(documentId: string, key: string, value: DocumentAnalysis): Promise<void> }
export class LLMAgentRunner {
  constructor(private provider: AIProvider, private cache?: AnalysisCache) {}
  async execute(snapshot: WorkspaceSnapshot, runId: string, emit: (run: AgentRun) => Promise<void>, requestSignal: AbortSignal) {
    const provider = this.provider; const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(aiLimits.agentTimeoutMs)]);
    const documents = snapshot.documents.filter(d => d.parseStatus === "completed");
    if (!documents.length || documents.length > aiLimits.maxDocumentsPerRun) throw new AIError("CONTENT_TOO_LONG", "Select 1-30 readable documents.", false, provider.name);
    const categories = [...new Set([...defaultCategories, ...snapshot.proposal?.documents.map(d => d.category) ?? []])];
    const base = buildOrganizationPlan(documents, d => snapshot.texts[d.id] ?? "");
    const run: AgentRun = { id: runId, status: "planning", simulation: false, engine: "llm", model: provider.models.main, promptVersion: `${PLANNER_PROMPT_VERSION}/${DOCUMENT_PROMPT_VERSION}/${ORGANIZATION_PROMPT_VERSION}`, startedAt: Date.now(), documents: snapshot.documents, steps: [], progress: 0, activity: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    const analyses = new Map<string, DocumentAnalysis>(); const read = new Set<string>();
    let duplicateDone = false; let relationshipsDone = false; let plan: OrganizationPlan | undefined; let calls = 0;
    const toolFailures = new Map<string, number>();
    const usage = (value: AIUsage) => { run.usage!.promptTokens += value.promptTokens; run.usage!.completionTokens += value.completionTokens; run.usage!.totalTokens += value.totalTokens; };
    const log = (message: string) => { run.activity.push({ id: crypto.randomUUID(), at: Date.now(), message }); };
    // Serialize publishes even when analysis workers complete concurrently.
    let publishing: Promise<void> = Promise.resolve();
    const publish = () => { const copy = structuredClone(run); publishing = publishing.then(() => emit(copy)); return publishing; };
    const doc = (id: string): ParsedDocument => { const document = documents.find(d => d.id === id); if (!document) throw new AIError("STRUCTURED_OUTPUT", "Tool document must belong to this workspace.", false, provider.name); return document; };
    async function step<T>(name: AgentTool, documentId: string | undefined, action: () => Promise<T>, summary: (result: T) => string): Promise<T> {
      signal.throwIfAborted();
      const item: AgentStep = { id: crypto.randomUUID(), tool: name, title: name.replaceAll("_", " "), description: documentId ? `${name.replaceAll("_", " ")} · ${doc(documentId).name}` : name.replaceAll("_", " "), status: "running", progress: 20, input: { documentId }, startedAt: Date.now() };
      run.steps.push(item); await publish();
      try { const result = await action(); signal.throwIfAborted(); item.status = "completed"; item.progress = 100; item.completedAt = Date.now(); item.output = summary(result); log(item.output); run.progress = Math.min(95, Math.round(analyses.size / documents.length * 70 + (duplicateDone ? 10 : 0) + (relationshipsDone ? 10 : 0))); await publish(); return result; }
      catch (error) { item.status = "failed"; item.error = normalizeAIError(error, provider.name).message; item.completedAt = Date.now(); await publish(); throw error; }
    }
    const idsSchema = z.object({ documentIds: z.array(z.uuid()).min(1).max(30) });
    const registry: ToolSet = {
      read_document: tool({ description: "Read bounded text and metadata for workspace document IDs.", inputSchema: idsSchema }),
      analyze_document: tool({ description: "Analyze previously read documents in a bounded queue. One structured call per document supplies summary, classification, tags and conservative filename suggestion.", inputSchema: idsSchema }),
      detect_duplicates: tool({ description: "Detect exact file hashes, normalized text hashes and filename similarity using code. No semantic similarity.", inputSchema: z.object({}) }),
      build_relationships: tool({ description: "Build rule-based relationships after all documents are analyzed.", inputSchema: z.object({}) }),
      generate_organization_plan: tool({ description: "Build a validated organization proposal after analysis, duplicates and relationships. Does not apply changes.", inputSchema: z.object({}) }),
    };
    const handlers: Record<string, (input: unknown) => Promise<unknown>> = {
      read_document: async input => {
        const { documentIds } = idsSchema.parse(input); documentIds.forEach(doc);
        return step("read_document", undefined, async () => documentIds.map(id => { const d = doc(id); read.add(id); return { id, name: d.name, type: d.type, characters: snapshot.texts[id]?.length ?? 0 }; }), result => `Read metadata and local text for ${result.length} documents`);
      },
      analyze_document: async input => {
        const { documentIds } = idsSchema.parse(input); documentIds.forEach(id => { doc(id); if (!read.has(id)) throw new AIError("STRUCTURED_OUTPUT", "Read documents before analysis.", true, provider.name); });
        await analysisQueue([...new Set(documentIds)].filter(id => !analyses.has(id)), async id => step("analyze_document", id, async () => {
          const document = doc(id);
          // Images and textless files have no LLM content analysis in Phase 4.
          if (!snapshot.texts[id]?.trim() || document.type === "image") {
            const fallback = base.documents.find(d => d.id === id)!;
            analyses.set(id, { summary: fallback.summary, category: fallback.category, tags: fallback.tags, isNewCategory: false, reason: "Metadata only; no readable text.", confidence: 0, filenameSuggestion: { shouldRename: false, suggestedFilename: null, reason: "No content analysis." } });
            log(`Metadata-only organization for “${document.name}” · no OCR or Vision`); return "metadata";
          }
          const key = `${document.contentHash ?? id}:${provider.models.small}:${DOCUMENT_PROMPT_VERSION}:${document.name}:${categories.join("|")}`;
          const cached = this.cache ? DocumentAnalysisSchema.safeParse(await this.cache.get(key)) : undefined;
          const value = cached?.success ? cached.data : await analyzeDocument(provider, document, snapshot.texts[id], categories, signal, usage);
          analyses.set(id, value); if (!cached?.success) await this.cache?.set(id, key, value);
          for (const [name, output] of [["summarize_document", value.summary], ["classify_document", `${value.category} · ${value.reason}`], ["generate_tags", value.tags.join(", ")], ["generate_filename", value.filenameSuggestion.shouldRename ? value.filenameSuggestion.suggestedFilename ?? "Keep original" : "Keep original filename"]] as const) {
            run.steps.push({ id: crypto.randomUUID(), tool: name, title: name.replaceAll("_", " "), description: `${cached?.success ? "Cached" : "AI"} analysis · shared structured call · ${document.name}`, status: "completed", progress: 100, input: { documentId: id }, output, completedAt: Date.now() });
          }
          return cached?.success ? "cached" : "AI";
        }, source => `Analyzed “${doc(id).name}” · ${source}`), signal);
        return { analyzed: [...analyses.keys()] };
      },
      detect_duplicates: async input => { z.object({}).parse(input); return step("detect_duplicates", undefined, async () => { base.duplicates = detectDuplicates(documents); duplicateDone = true; return base.duplicates; }, result => `${result.length} duplicate groups · exact / text / name checks`); },
      build_relationships: async input => {
        z.object({}).parse(input); if (analyses.size !== documents.length) throw new AIError("STRUCTURED_OUTPUT", "Analyze all documents first.", true, provider.name);
        return step("build_relationships", undefined, async () => { applyAnalyses(); base.relationships = buildRelationships(base.documents); relationshipsDone = true; return base.relationships; }, result => `${result.length} rule-based relationships`);
      },
      generate_organization_plan: async input => {
        z.object({}).parse(input); if (analyses.size !== documents.length || !duplicateDone || !relationshipsDone) throw new AIError("STRUCTURED_OUTPUT", "Complete analysis, duplicate and relationship checks first.", true, provider.name);
        return step("generate_organization_plan", undefined, async () => {
          applyAnalyses(); let output: z.infer<typeof OrganizationOutputSchema> | undefined;
          for (let attempt = 0; attempt <= aiLimits.maxToolRetries; attempt++) {
            try {
              const result = await provider.generateObject({ role: "main", system: organizationPlanPrompt, prompt: untrustedData({ documents: base.documents.map(d => ({ id: d.id, name: d.originalName, summary: d.summary, category: d.category, tags: d.tags })), duplicates: base.duplicates, existingCategories: categories }), schema: OrganizationOutputSchema, signal }); usage(result.usage);
              output = OrganizationOutputSchema.parse(result.object); const ids = new Set(output.documents.map(d => d.id));
              const allowedCategories = new Set([...categories, ...base.documents.map(d => d.category)]);
              if (ids.size !== documents.length || output.documents.length !== documents.length || output.documents.some(d => !documents.some(own => own.id === d.id) || !allowedCategories.has(d.category))) throw new Error("Invalid proposal references");
              break;
            } catch { output = undefined; signal.throwIfAborted(); }
          }
          if (output) { base.documents = base.documents.map(d => ({ ...d, category: output!.documents.find(item => item.id === d.id)!.category })); base.summary = output.workspaceSummary; base.relationships = buildRelationships(base.documents); }
          else { log("AI plan validation failed twice · using a deterministic proposal from document analyses"); run.fallback = "AI plan unavailable — using a deterministic proposal from document analyses."; }
          base.simulation = false; plan = OrganizationProposalSchema.parse(base); return { documents: plan.documents.length, summary: plan.summary ?? "Review your organization proposal." };
        }, () => "Organization proposal ready · changes require your review");
      },
    };
    const toolRegistry = ToolRegistry.fromSDK(registry, handlers);
    function applyAnalyses() {
      let newCategory: string | undefined;
      base.documents = base.documents.map(d => {
        const a = analyses.get(d.id); if (!a) return d;
        let category = a.category;
        if (!categories.includes(category)) { newCategory ??= category; if (category !== newCategory) category = "Other"; }
        return { ...d, summary: a.summary, category, tags: a.tags, suggestedName: a.filenameSuggestion.shouldRename ? a.filenameSuggestion.suggestedFilename ?? undefined : undefined };
      });
    }
    log("FileMind Intelligence · planning with AI tool calls"); await publish();
    const messages: ModelMessage[] = [{ role: "user", content: untrustedData({ documents: documents.map(d => ({ id: d.id, name: d.name, type: d.type })), goal: "Prepare a proposal for review" }) }];
    try {
      run.status = "running";
      for (let turn = 0; turn < aiLimits.maxAgentSteps && !plan; turn++) {
        signal.throwIfAborted(); const response = await provider.callTools({ system: agentPlannerPrompt, messages, tools: toolRegistry.forModel(), signal }); usage(response.usage); messages.push(...response.messages);
        if (!response.calls.length) throw new AIError("STRUCTURED_OUTPUT", "Planner did not choose a tool.", true, provider.name);
        for (const call of response.calls) {
          if (++calls > aiLimits.maxAgentSteps) throw new AIError("STEP_LIMIT", "Agent reached its step limit.", false, provider.name);
          if (!toolRegistry.has(call.name)) throw new AIError("STRUCTURED_OUTPUT", "Planner requested an unavailable tool.", false, provider.name);
          let result: unknown;
          try { result = await toolRegistry.execute(call.name, call.input); }
          catch (error) { signal.throwIfAborted(); if (error instanceof WorkspaceError) throw error; const ai = normalizeAIError(error, provider.name); const failed = (toolFailures.get(call.name) ?? 0) + 1; toolFailures.set(call.name, failed); if (!ai.retryable || ai.code !== "STRUCTURED_OUTPUT" || failed > aiLimits.maxToolRetries) throw ai; result = { error: ai.message, retryable: true }; }
          messages.push({ role: "tool", content: [{ type: "tool-result", toolCallId: call.id, toolName: call.name, output: { type: "json", value: JSON.parse(JSON.stringify(result)) } }] });
          if (plan) break;
        }
      }
      if (!plan) throw new AIError("STEP_LIMIT", "Agent reached its step limit.", false, provider.name);
      run.result = plan; run.status = "waiting_for_review"; run.progress = 100; log("Proposal ready · AI proposes, you decide");
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      if (requestSignal.aborted) { run.status = "cancelled"; log("Run interrupted or cancelled · no background execution"); }
      else {
        const ai = normalizeAIError(error, provider.name); run.fallback = "AI analysis unavailable — using basic local organization."; run.error = undefined;
        run.result = OrganizationProposalSchema.parse(buildOrganizationPlan(documents, d => snapshot.texts[d.id] ?? "")); run.status = "waiting_for_review"; run.progress = 100;
        log(ai.message); log(run.fallback);
      }
    }
    await publish(); return run;
  }
}
// Prompts are imported from versioned modules; document content never enters system prompts.
export const analysisSystemBoundary = documentAnalysisPrompt;
