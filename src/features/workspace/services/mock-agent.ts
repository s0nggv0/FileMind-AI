import type { AgentEngine, AgentRun, AgentStep, AgentTool, DemoFault, OrganizationPlan, ParsedDocument, RunListener } from "@/types/workspace";
import { getDocumentContent, parseDocument } from "./file-parser";
import { buildOrganizationPlan } from "@/lib/workspace/organization-rules";

const tools: [AgentTool, string, string][] = [
  ["summarize_document", "理解内容", "正在准备正文摘录"],
  ["classify_document", "识别主题", "根据文件名和正文规则分类"],
  ["generate_tags", "生成标签", "根据可识别的关键词推荐标签"],
  ["detect_duplicates", "查找相似文件", "仅比较规范化后的文件名"],
  ["build_relationships", "建立关联", "关联共同分类与标签"],
  ["generate_organization_plan", "生成整理方案", "正在准备待审阅方案"],
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
        this.log(context, "工作区分析已开始 · 模拟助手演示"); this.publish(context);
        await delay(this.pace, signal);
        for (const document of run.documents) {
          run.steps.push(this.makeStep("read_document", "读取资料", `正在读取“${document.name}”`, document.id));
        }
        this.publish(context);
        for (const [tool, title, description] of tools) {
          await delay(this.pace / 3, signal); run.steps.push(this.makeStep(tool, title, description)); this.publish(context);
        }
        run.status = "running"; this.log(context, `正在读取 ${run.documents.length} 份资料`);
      }
      if (context.fault === "agent" && !context.faultUsed) { context.faultUsed = true; throw new Error("模拟助手故障。重新启动后，将不再注入此故障。"); }
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
            context.faultUsed = true; throw new Error(doc ? "模拟解析故障：无法解析资料" : "模拟工具故障：标签生成已中断");
          }
          if (doc) {
            const parsed = await this.parser(doc, signal); signal.throwIfAborted(); Object.assign(doc, parsed);
            step.output = doc.type === "image" ? `已读取文件信息 ·  ${doc.metadata.width} × ${doc.metadata.height}` : `${doc.metadata.characters ?? 0} 个字符已提取${doc.pageCount ? ` · ${doc.pageCount} 页` : ""}`;
          } else {
            const draft = buildOrganizationPlan(run.documents, getDocumentContent);
            const outputs: Partial<Record<AgentTool, string>> = {
              summarize_document: `${draft.documents.length} 份摘录已准备`, classify_document: `发现  ${new Set(draft.documents.map((document) => document.category)).size} 个主要主题`,
              generate_tags: `${new Set(draft.documents.flatMap((document) => document.tags)).size} 个标签建议`,
              detect_duplicates: `${draft.duplicates.length} 组重复候选 · 名称相似`, build_relationships: `${draft.relationships.length} 条按规则建立的关联`,
              generate_organization_plan: "整理建议已就绪",
            };
            step.output = outputs[step.tool];
            if (step.tool === "generate_organization_plan") run.result = draft;
          }
          signal.throwIfAborted(); step.status = "completed"; step.progress = 100; step.completedAt = Date.now();
          this.log(context, step.output ?? `${step.title}已完成`);
        } catch (error) {
          if (signal.aborted) throw error;
          step.status = "failed"; step.completedAt = Date.now(); step.error = error instanceof Error ? error.message : "无法执行工具";
          if (doc) { doc.parseStatus = "failed"; doc.parseError = step.error; }
          this.log(context, `${step.title} 失败 · 请重试或跳过后继续`); this.publish(context); return;
        }
        run.progress = Math.round(run.steps.filter((item) => ["completed", "skipped"].includes(item.status)).length / run.steps.length * 100);
        this.publish(context);
      }
      if (!run.result?.documents.length) throw new Error("没有可处理的资料，请选择可读取的文件后重新开始。");
      run.status = "waiting_for_review"; run.progress = 100; this.log(context, "整理建议已就绪 · 等待你审阅"); this.publish(context);
    } catch (error) {
      if (!signal.aborted) { run.status = "failed"; run.error = error instanceof Error ? error.message : "整理助手故障"; this.log(context, run.error); this.publish(context); }
    } finally { context.busy = false; }
  }
  cancelRun(runId: string) {
    const context = this.contexts.get(runId);
    if (!context || !["planning", "running", "applying"].includes(context.run.status)) return;
    context.controller.abort(); context.run.status = "cancelled";
    this.log(context, "整理已停止，文件未被修改。"); this.publish(context);
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
    this.log(context, `已跳过“${document?.name}”`);
    await this.executeRun(runId, onUpdate);
  }
  async applyPlan(runId: string, plan: OrganizationPlan, onUpdate: RunListener) {
    const context = this.contexts.get(runId);
    if (!context || context.busy || context.run.status !== "waiting_for_review") return;
    context.listener = onUpdate; context.busy = true; context.run.status = "applying"; this.publish(context);
    try {
      await delay(this.pace * 2, context.controller.signal);
      context.run.result = structuredClone({ ...plan, relationships: plan.relationships.filter(r => r.decision !== "ignored") }); context.run.status = "completed"; context.run.completedAt = Date.now();
      this.log(context, "方案已应用，仅保存在当前浏览器会话"); this.publish(context);
    } catch (error) {
      if (!context.controller.signal.aborted) { context.run.status = "failed"; context.run.error = error instanceof Error ? error.message : "无法应用方案"; this.publish(context); }
    } finally { context.busy = false; }
  }
  disposeRun(runId: string) { const context = this.contexts.get(runId); context?.controller.abort(); this.contexts.delete(runId); }
}
