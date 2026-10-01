import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";

export function DemoNote({ children }: { children?: ReactNode }) {
  return <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><FlaskConical className="mt-0.5 size-3.5 shrink-0" /><span>{children ?? "演示空间 · 仅使用本地示例数据，尚未连接 AI 与数据库。"}</span></div>;
}
