import { WorkflowLine } from "./workflow-line";

export function WorkflowSection({ steps }: { steps: { label: string; description: string; detail: string }[] }) {
  return (
    <section id="how-it-works" className="border-y bg-surface-primary">
      <div className="marketing-width marketing-section">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4"><h2 className="section-title">从导入资料，到查找知识。</h2><p className="max-w-xs text-sm leading-6 text-muted-foreground">产品工作流程 · 当前为前端预览<br />AI 整理与检索问答，分析、整理，再连接。</p></div>
        <div className="relative"><WorkflowLine /><ol className="relative grid gap-7 md:grid-cols-5 md:gap-5">{steps.map((step, index) => <li key={step.label} className="flex gap-4 md:block"><span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border bg-card font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</span><div className="md:mt-5"><h3 className="text-base font-medium">{step.label}</h3><p className="mt-2 text-xs leading-6">{step.description}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{step.detail}</p></div></li>)}</ol></div>
      </div>
    </section>
  );
}
