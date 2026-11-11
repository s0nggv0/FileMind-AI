import { CleanupDemo } from "./cleanup-demo";
import type { CleanupComparison } from "@/types/presentation";

export function CleanupShowcase({ comparison }: { comparison: CleanupComparison }) {
  return (
    <section className="border-t">
      <div className="marketing-width marketing-section grid items-center gap-10 lg:grid-cols-2">
        <div><h2 className="section-title">AI 提出建议，<br /><span className="text-primary">由你决定。</span></h2><p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">重复版本、过时记录、凌乱的命名，交给 FileMind 提出建议。保留什么、如何整理，由你看过差异之后决定。</p><p className="mt-6 text-xs text-muted-foreground">人工审阅 · 每一步决定，都在你手里。</p></div>
        <CleanupDemo comparison={comparison} />
      </div>
    </section>
  );
}
