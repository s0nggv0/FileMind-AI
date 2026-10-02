import type { AgentEngine, AgentRun, AgentStep, AgentTool, DemoFault, OrganizationPlan, ParsedDocument, RunListener } from "@/types/workspace";
import { parseDocument } from "./file-parser";
import { buildOrganizationPlan } from "./organization-rules";

const tools: [AgentTool, string, string][] = [
  ["summarize_document", "Understand content", "Preparing excerpts from extracted text"],
  ["classify_document", "Detect topics", "Grouping documents with filename and text rules"],
  ["generate_tags", "Generate tags", "Suggesting tags from recognizable keywords"],
  ["detect_duplicates", "Identify similarities", "Comparing normalized filenames only"],
  ["build_relationships", "Build relationships", "Connecting shared categories and tags"],
  ["generate_organization_plan", "Create organization plan", "Preparing a proposal for your review"],
];
type Context = { run: AgentRun; controller: AbortController; fault: DemoFault; faultUsed: boolean; busy: boolean; listener?: RunListener };
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export class MockAgentEngine implements AgentEngine {
  private contexts = new Map<string, Context>();
  constructor(private pace = 440, private parser = parseDocument) {}
  restoreRun(run: AgentRun) { this.contexts.set(run.id, { run: structuredClone(run), controller: new AbortController(), fault: "none", faultUsed: false, busy: false }); }
  getRun(id: string) { return this.contexts.get(id)?.run; }
  createRun(documents: ParsedDocument[], fault: DemoFault = "none") {
    const run: AgentRun = { id: crypto.randomUUID(), status: "planning", simulation: true, startedAt: Date.now(), documents: structuredClone(documents), steps: [], progress: 0, activity: [] };
    this.contexts.set(run.id, { run, controller: new AbortController(), fault, faultUsed: false, busy: false });
    return structuredClone(run);
  }
  private publish(context: Context) { context.listener?.(structuredClone(context.run)); }
  private log(context: Context, message: string) { context.run.activity.push({ id: crypto.randomUUID(), at: Date.now(), message }); }
  private makeStep(tool: AgentTool, title: string, description: string, documentId?: string): AgentStep {
    return { id: crypto.randomUUID(), tool, title, description, status: "pending", progress: 0, input: { documentId } };
  }
  async executeRun(runId: string, onUpdate: RunListener) {
    const context = this.contexts.get(runId);
    if (!context || context.busy || !["planning", "running"].includes(context.run.status)) return;
    context.busy = true; context.listener = onUpdate;
    const { run, controller } = context; const signal = controller.signal;
    try {
      if (run.status === "planning") {
        this.log(context, "Workspace analysis started · Agent Demo"); this.publish(context);
        await delay(this.pace, signal);
        for (const document of run.documents) {
          run.steps.push(this.makeStep("read_document", "Read document", `Reading “${document.name}”`, document.id));
        }
        this.publish(context);
        for (const [tool, title, description] of tools) {
          await delay(this.pace / 3, signal); run.steps.push(this.makeStep(tool, title, description)); this.publish(context);
        }
        run.status = "running"; this.log(context, `Reading ${run.documents.length} documents`);
      }
      if (context.fault === "agent" && !context.faultUsed) { context.faultUsed = true; throw new Error("Simulated Agent Error. Restart to run again without the injected failure."); }
      for (const step of run.steps) {
        if (step.status === "failed") return;
        if (step.status !== "pending") continue;
        step.status = "running"; step.progress = 15; step.startedAt = Date.now(); step.completedAt = undefined; step.error = undefined;
        const doc = run.documents.find((document) => document.id === step.input.documentId);
        if (doc) { doc.parseStatus = "processing"; doc.parseError = undefined; }
        this.log(context, step.description); this.publish(context);
        try {
          await delay(this.pace, signal);
          if (!context.faultUsed && ((context.fault === "parse" && doc) || (context.fault === "tool" && step.tool === "generate_tags"))) {
            context.faultUsed = true; throw new Error(doc ? "Simulated Parse Error: Unable to parse document" : "Simulated Tool Error: tag generation interrupted");
          }
          if (doc) {
            const parsed = await this.parser(doc, signal); signal.throwIfAborted(); Object.assign(doc, parsed);
            step.output = doc.type === "image" ? `Metadata captured · ${doc.metadata.width} × ${doc.metadata.height}` : `${doc.metadata.characters ?? 0} characters extracted${doc.pageCount ? ` · ${doc.pageCount} pages` : ""}`;
          } else {
            const draft = buildOrganizationPlan(run.documents);
            const outputs: Partial<Record<AgentTool, string>> = {
              summarize_document: `${draft.documents.length} excerpts prepared`, classify_document: `Found ${new Set(draft.documents.map((document) => document.category)).size} primary topics`,
              generate_tags: `${new Set(draft.documents.flatMap((document) => document.tags)).size} distinct tags suggested`,
              detect_duplicates: `${draft.duplicates.length} possible duplicate groups · name similarity`, build_relationships: `${draft.relationships.length} rule-based relationships discovered`,
              generate_organization_plan: "Organization proposal ready",
            };
            step.output = outputs[step.tool];
            if (step.tool === "generate_organization_plan") run.result = draft;
          }
          signal.throwIfAborted(); step.status = "completed"; step.progress = 100; step.completedAt = Date.now();
          this.log(context, step.output ?? `${step.title} completed`);
        } catch (error) {
          if (signal.aborted) throw error;
          step.status = "failed"; step.completedAt = Date.now(); step.error = error instanceof Error ? error.message : "Unable to execute tool";
          if (doc) { doc.parseStatus = "failed"; doc.parseError = step.error; }
          this.log(context, `${step.title} failed · retry or skip to continue`); this.publish(context); return;
        }
        run.progress = Math.round(run.steps.filter((item) => ["completed", "skipped"].includes(item.status)).length / run.steps.length * 100);
        this.publish(context);
      }
      if (!run.result?.documents.length) throw new Error("No documents could be processed. Restart with a readable file.");
      run.status = "waiting_for_review"; run.progress = 100; this.log(context, "Organization proposal ready · waiting for your review"); this.publish(context);
    } catch (error) {
      if (!signal.aborted) { run.status = "failed"; run.error = error instanceof Error ? error.message : "Agent Error"; this.log(context, run.error); this.publish(context); }
    } finally { context.busy = false; }
  }
  cancelRun(runId: string) {
    const context = this.contexts.get(runId);
    if (!context || !["planning", "running", "applying"].includes(context.run.status)) return;
    context.controller.abort(); context.run.status = "cancelled";
    this.log(context, "Organization stopped. Your files were not changed."); this.publish(context);
  }
  async retryStep(runId: string, stepId: string, onUpdate: RunListener) {
    const context = this.contexts.get(runId); const step = context?.run.steps.find((item) => item.id === stepId);
    if (!context || context.busy || context.run.status !== "running" || step?.status !== "failed") return;
    step.status = "pending"; step.progress = 0;
    await this.executeRun(runId, onUpdate);
  }
  async skipStep(runId: string, stepId: string, onUpdate: RunListener) {
    const context = this.contexts.get(runId); const step = context?.run.steps.find((item) => item.id === stepId);
    if (!context || context.busy || context.run.status !== "running" || step?.status !== "failed" || !step.input.documentId) return;
    step.status = "skipped"; step.progress = 100;
    const document = context.run.documents.find((item) => item.id === step.input.documentId);
    if (document) document.parseStatus = "skipped";
    this.log(context, `Skipped “${document?.name}”`);
    await this.executeRun(runId, onUpdate);
  }
  async applyPlan(runId: string, plan: OrganizationPlan, onUpdate: RunListener) {
    const context = this.contexts.get(runId);
    if (!context || context.busy || context.run.status !== "waiting_for_review") return;
    context.listener = onUpdate; context.busy = true; context.run.status = "applying"; this.publish(context);
    try {
      await delay(this.pace * 2, context.controller.signal);
      context.run.result = structuredClone({ ...plan, relationships: plan.relationships.filter(r => r.decision !== "ignored") }); context.run.status = "completed"; context.run.completedAt = Date.now();
      this.log(context, "Plan applied to this browser session only"); this.publish(context);
    } catch (error) {
      if (!context.controller.signal.aborted) { context.run.status = "failed"; context.run.error = error instanceof Error ? error.message : "Unable to apply plan"; this.publish(context); }
    } finally { context.busy = false; }
  }
  disposeRun(runId: string) { const context = this.contexts.get(runId); context?.controller.abort(); this.contexts.delete(runId); }
}
