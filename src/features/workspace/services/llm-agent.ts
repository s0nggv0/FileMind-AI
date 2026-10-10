import { z } from "zod";
import type { AgentEngine, AgentRun, OrganizationPlan, ParsedDocument, RunListener } from "@/types/workspace";
import { RunSchema } from "@/lib/workspace/schemas";
import { parseDocument } from "./file-parser";
import { PersistenceClient } from "./persistence-client";
type Context = { run: AgentRun; signal: AbortController; listener?: RunListener; busy: boolean };
export class LLMAgentEngine implements AgentEngine {
  private contexts = new Map<string, Context>();
  constructor(private persistence: PersistenceClient) {}
  restoreRun(run: AgentRun) { this.contexts.set(run.id, { run, signal: new AbortController(), busy: false }); }
  createRun(documents: ParsedDocument[]) {
    const run: AgentRun = { id: crypto.randomUUID(), status: "planning", engine: "llm", simulation: false, startedAt: Date.now(), documents: structuredClone(documents), progress: 0, steps: [], activity: [] };
    this.restoreRun(run); return structuredClone(run);
  }
  async executeRun(id: string, listener: RunListener) {
    const context = this.contexts.get(id); if (!context || context.busy) return;
    context.listener = listener; context.busy = true; const signal = context.signal.signal;
    const emit = () => listener(structuredClone(context.run));
    try {
      context.run.status = "running"; emit();
      for (const document of context.run.documents) {
        if (["completed", "skipped"].includes(document.parseStatus)) continue;
        const step = { id: crypto.randomUUID(), tool: "read_document" as const, title: "解析资料", description: `正在本地解析 ·  ${document.name}`, status: "running" as "running" | "completed" | "failed", progress: 10, startedAt: Date.now(), input: { documentId: document.id }, error: undefined as string | undefined };
        context.run.steps.push(step); document.parseStatus = "processing"; emit();
        try { Object.assign(document, await parseDocument(document, signal)); signal.throwIfAborted(); step.status = "completed"; step.progress = 100; }
        catch { signal.throwIfAborted(); document.parseStatus = "failed"; document.parseError = "无法解析这份资料，请重试或跳过。"; step.status = "failed"; step.error = document.parseError; emit(); return; }
        emit();
      }
      if (!this.persistence.persistent) throw new Error("配置持久化存储后可使用 AI 整理，或继续使用本地规则。");
      await this.persistence.prepare(context.run.documents); signal.throwIfAborted();
      const snapshot = this.persistence.snapshot!;
      const response = await fetch("/api/ai/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: snapshot.id, revision: snapshot.revision, runId: id }), signal });
      if (!response.ok) { const body = z.object({ error: z.string() }).safeParse(await response.json()); throw new Error(body.data?.error ?? "AI 服务暂时不可用，请稍后重试。"); }
      const reader = response.body?.getReader(); if (!reader) throw new Error("AI 服务未能启动，请重试。");
      const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break; signal.throwIfAborted(); buffer += decoder.decode(value, { stream: true });
        let lineEnd: number;
        while ((lineEnd = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, lineEnd); buffer = buffer.slice(lineEnd + 1); if (!line.trim()) continue;
          const event = z.object({ run: RunSchema.optional(), revision: z.number().int().optional(), error: z.string().optional() }).parse(JSON.parse(line));
          if (event.error) throw new Error(event.error);
          if (event.run) { if (event.run.id !== id) throw new Error("整理助手返回了无法识别的响应，请重试。"); context.run = event.run; if (this.persistence.snapshot) Object.assign(this.persistence.snapshot, { run: event.run, revision: event.revision, documents: event.run.documents, proposal: event.run.result ?? null }); emit(); }
        }
      }
      if (!["waiting_for_review", "completed", "cancelled"].includes(context.run.status)) throw new Error("整理已中断，点击继续分析后恢复。");
    } catch (error) { if (!signal.aborted) { context.run.status = "failed"; context.run.error = error instanceof Error ? error.message : "AI 服务暂时不可用，请稍后重试。"; emit(); } }
    finally { context.busy = false; }
  }
  cancelRun(id: string) { const c = this.contexts.get(id); if (!c) return; c.signal.abort(); c.run.status = "cancelled"; c.listener?.(structuredClone(c.run)); }
  async retryStep(id: string, stepId: string, listener: RunListener) { const c = this.contexts.get(id); const s = c?.run.steps.find(step => step.id === stepId); if (!c || c.busy || s?.status !== "failed") return; const d = c.run.documents.find(d => d.id === s.input.documentId); if (d) d.parseStatus = "ready"; s.status = "skipped"; await this.executeRun(id, listener); }
  async skipStep(id: string, stepId: string, listener: RunListener) { const c = this.contexts.get(id); const s = c?.run.steps.find(step => step.id === stepId); if (!c || c.busy || s?.status !== "failed") return; const d = c.run.documents.find(d => d.id === s.input.documentId); if (d) d.parseStatus = "skipped"; s.status = "skipped"; await this.executeRun(id, listener); }
  async applyPlan(id: string, plan: OrganizationPlan, listener: RunListener) { const c = this.contexts.get(id); if (!c || c.busy || c.run.status !== "waiting_for_review") return; c.busy = true; try { const result = await this.persistence.apply(plan); c.run = result; listener(structuredClone(result)); } finally { c.busy = false; } }
  disposeRun(id: string) { this.contexts.get(id)?.signal.abort(); this.contexts.delete(id); }
}
