import type { AgentEngine, AgentRun, DemoFault, OrganizationPlan, ParsedDocument, RunListener } from "@/types/workspace";
import { MockAgentEngine } from "./mock-agent";
import { LLMAgentEngine } from "./llm-agent";
import { PersistenceClient } from "./persistence-client";
import { parseDocument } from "./file-parser";

// Provider selection belongs to this service boundary; components use AgentEngine only.
export class WorkspaceAgentEngine implements AgentEngine {
  private persistence = new PersistenceClient(); private mock = new MockAgentEngine();
  private llm = new LLMAgentEngine(this.persistence); private active: AgentEngine = this.mock;
  async initialize(id?: string) {
    const session = await this.persistence.initialize(id); this.active = this.persistence.intelligence ? this.llm : this.mock;
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
    } catch (error) { initial.status = "failed"; initial.error = error instanceof Error ? error.message : "Workspace could not be saved."; listener(structuredClone(initial)); return; }
    let pending: Promise<void> = Promise.resolve(); let latest: AgentRun | undefined; let saveError: unknown;
    await this.mock.executeRun(id, run => {
      latest = run; if (run.status !== "waiting_for_review") listener(run);
      pending = pending.then(async () => {
        await this.persistence.saveRun({ ...run, engine: "mock" });
      }).catch(error => { saveError = error; });
    });
    await pending;
    if (saveError && latest) { latest.error = saveError instanceof Error ? saveError.message : "Workspace could not be saved."; latest.status = "failed"; listener(latest); }
    else if (latest?.status === "waiting_for_review") listener(latest);
  }
  cancelRun(id: string) { this.active.cancelRun(id); }
  async retryStep(id: string, step: string, listener: RunListener) { await this.active.retryStep(id, step, listener); if (this.active === this.mock) { const run = this.mock.getRun(id); if (run) await this.persistence.saveRun(run); } }
  async skipStep(id: string, step: string, listener: RunListener) { await this.active.skipStep(id, step, listener); if (this.active === this.mock) { const run = this.mock.getRun(id); if (run) await this.persistence.saveRun(run); } }
  async applyPlan(id: string, plan: OrganizationPlan, listener: RunListener) {
    if (this.persistence.persistent && this.active === this.mock) { const run = await this.persistence.apply(plan); this.mock.restoreRun(run); listener(run); return; }
    return this.active.applyPlan(id, plan, listener);
  }
  saveProposal(plan: OrganizationPlan) { return this.persistence.saveProposal(plan); }
  async continueLocally(documents: ParsedDocument[], listener: RunListener) {
    this.active = this.mock; const run = this.mock.createRun(documents); run.fallback = "AI analysis unavailable — using basic local organization."; listener(run);
    await this.executeRun(run.id, value => listener({ ...value, fallback: run.fallback }));
  }
  disposeRun(id: string) { this.active.disposeRun(id); }
  resetWorkspace() { this.persistence.reset(); this.active = this.persistence.intelligence ? this.llm : this.mock; }
  getWorkspaceId() { return this.persistence.snapshot?.id; }
}
