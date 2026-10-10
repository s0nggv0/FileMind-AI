import type { AgentEngine, AgentRun, DemoFault, OrganizationPlan, ParsedDocument, RunListener } from "@/types/workspace";
import { MockAgentEngine } from "./mock-agent";
import { LLMAgentEngine } from "./llm-agent";
import { PersistenceClient } from "./persistence-client";
import { parseDocument } from "./file-parser";
import { buildOrganizationPlan } from "./organization-rules";

// Provider selection belongs to this service boundary; components use AgentEngine only.
export class WorkspaceAgentEngine implements AgentEngine {
  private persistence = new PersistenceClient(); private mock = new MockAgentEngine();
  private llm = new LLMAgentEngine(this.persistence); private active: AgentEngine = this.mock;
  async initialize(id?: string) {
    const session = await this.persistence.initialize(id); this.active = this.persistence.intelligence ? this.llm : this.mock;
    if (this.persistence.competition && session.snapshot?.run?.engine === "mock") throw new Error("云端 AI 服务不可用，比赛模式无法执行已保存的模拟记录。");
    if (session.snapshot?.run) { this.active = session.snapshot.run.engine === "llm" ? this.llm : this.mock; if (this.active === this.llm) this.llm.restoreRun(session.snapshot.run); else this.mock.restoreRun(session.snapshot.run); }
    return session;
  }
  createRun(documents: ParsedDocument[], fault?: DemoFault) { return this.active.createRun(documents, fault); }
  async executeRun(id: string, listener: RunListener) {
    if (this.active === this.llm || !this.persistence.persistent) return this.active.executeRun(id, listener);
    const initial = this.mock.getRun(id); if (!initial) return;
    try {
      const documents: ParsedDocument[] = [];
      for (const document of initial.documents) {
        if (initial.status === "cancelled") return;
        documents.push(document.parseStatus === "completed" || document.parseStatus === "skipped" ? document : await parseDocument(document, new AbortController().signal).catch(() => document));
      }
      await this.persistence.prepare(documents);
      for (const document of initial.documents) document.storagePath = documents.find(d => d.id === document.id)?.storagePath;
    } catch (error) { initial.status = "failed"; initial.error = error instanceof Error ? error.message : "工作区保存失败，请重试。"; listener(structuredClone(initial)); return; }
    let pending: Promise<void> = Promise.resolve(); let latest: AgentRun | undefined; let saveError: unknown;
    await this.mock.executeRun(id, run => {
      latest = run; if (run.status !== "waiting_for_review") listener(run);
      pending = pending.then(async () => {
        await this.persistence.saveRun({ ...run, engine: "mock" });
      }).catch(error => { saveError = error; });
    });
    await pending;
    if (!saveError && latest?.status === "waiting_for_review" && latest.documents.some(d => d.type === "image")) {
      try {
        const processing = structuredClone(latest); processing.status = "running";
        processing.activity.push({ id: crypto.randomUUID(), at: Date.now(), message: "正在提取可见文字 · 本地 OCR" }); listener(processing);
        const messages = await this.persistence.analyzeImages();
        latest.documents = this.persistence.snapshot!.documents;
        latest.result = buildOrganizationPlan(latest.documents, d => this.persistence.snapshot!.texts[d.id] ?? "");
        latest.activity.push(...messages.map(message => ({ id: crypto.randomUUID(), at: Date.now(), message })));
        await this.persistence.saveRun(latest); this.mock.restoreRun(latest);
      } catch (error) { saveError = error; }
    }
    if (saveError && latest) { latest.error = saveError instanceof Error ? saveError.message : "工作区保存失败，请重试。"; latest.status = "failed"; listener(latest); }
    else if (latest?.status === "waiting_for_review") listener(latest);
  }
  cancelRun(id: string) { this.active.cancelRun(id); }
  private async continueMock(id: string, action: (listener: RunListener) => Promise<void>, listener: RunListener) {
    let final: AgentRun | undefined;
    await action(run => { final = run; if (run.status !== "waiting_for_review") listener(run); });
    if (final) { await this.persistence.saveRun({ ...final, engine: "mock" }); listener(final); }
  }
  async retryStep(id: string, step: string, listener: RunListener) {
    if (this.active === this.mock && this.persistence.persistent) return this.continueMock(id, update => this.mock.retryStep(id, step, update), listener);
    await this.active.retryStep(id, step, listener);
  }
  async skipStep(id: string, step: string, listener: RunListener) {
    if (this.active === this.mock && this.persistence.persistent) return this.continueMock(id, update => this.mock.skipStep(id, step, update), listener);
    await this.active.skipStep(id, step, listener);
  }
  async applyPlan(id: string, plan: OrganizationPlan, listener: RunListener) {
    if (this.persistence.persistent && this.active === this.mock) { const run = await this.persistence.apply(plan); this.mock.restoreRun(run); listener(run); return; }
    return this.active.applyPlan(id, plan, listener);
  }
  saveProposal(plan: OrganizationPlan) { return this.persistence.saveProposal(plan); }
  async continueLocally(documents: ParsedDocument[], listener: RunListener) {
    if (this.persistence.competition) throw new Error("云端 AI 服务不可用，比赛模式需要真实 AI 服务。");
    this.active = this.mock; const run = this.mock.createRun(documents); run.fallback = "AI 分析不可用，当前使用本地规则整理。"; listener(run);
    await this.executeRun(run.id, value => listener({ ...value, fallback: run.fallback }));
  }
  disposeRun(id: string) { this.active.disposeRun(id); }
  resetWorkspace() { this.persistence.reset(); this.active = this.persistence.intelligence ? this.llm : this.mock; }
  getWorkspaceId() { return this.persistence.snapshot?.id; }
}
