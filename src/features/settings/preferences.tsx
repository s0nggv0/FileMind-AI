"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { FolderOpen, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { cn } from "@/lib/utils";
import { IdentityRecovery } from "./identity-recovery";
import { DataBackup } from "./data-backup";
import { StorageMaintenance } from "./storage-maintenance";
import { DemoWorkspace } from "./demo-workspace";

type PreviewState = "empty" | "loading" | "error" | "skeleton";
const subscribe = () => () => undefined;

export function Preferences({demoMode=false,showDevelopment=true,build}:{demoMode?:boolean;showDevelopment?:boolean;build?:{version:string;commit:string;date:string}}) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [preview, setPreview] = useState<PreviewState>("empty");

  return (
    <div className="max-w-4xl space-y-9">
      <section><h2 className="text-sm font-semibold">外观偏好</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">选择最适合阅读的界面。主题偏好保存在当前浏览器。</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{[{ value: "light", label: "浅色", icon: Sun }, { value: "dark", label: "深色", icon: Moon }, { value: "system", label: "跟随系统", icon: Monitor }].map(({ value, label, icon: Icon }) => { const active = mounted ? theme === value : value === "system"; return <button key={value} aria-pressed={active} onClick={() => setTheme(value)} className={cn("flex items-center gap-3 rounded-xl border p-5 text-sm transition-colors", active ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-card hover:bg-muted/50")}><Icon size={18} />{label}{active && <span className="ml-auto size-1.5 rounded-full bg-primary" />}</button>; })}</div></section>
      <section className="border-t border-border pt-7"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">工作空间连接</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">工作区显示当前存储与分析模式。保存的资料绑定当前浏览器身份，可以用恢复密钥在同一数据库中找回。</p></div><Badge variant="outline" className="shrink-0">私有工作区</Badge></div></section>
      {build&&<section className="border-t border-border pt-7"><h2 className="text-sm font-semibold">关于 FileMind AI</h2><dl className="mt-4 space-y-2 text-sm"><div className="flex flex-wrap gap-3"><dt className="text-muted-foreground">版本</dt><dd>{build.version}</dd></div><div className="flex flex-wrap gap-3"><dt className="text-muted-foreground">构建提交</dt><dd className="break-all font-mono text-xs">{build.commit}</dd></div><div className="flex flex-wrap gap-3"><dt className="text-muted-foreground">构建日期</dt><dd>{build.date}</dd></div></dl></section>}
      <IdentityRecovery />
      <DataBackup />
      <StorageMaintenance />
      {demoMode&&<DemoWorkspace />}
      {showDevelopment&&<section className="border-t border-border pt-7"><h2 className="text-sm font-semibold">界面状态预览</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">统一的空白、加载、异常与骨架状态，供后续真实功能复用。</p><div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="界面状态">{[{ value: "empty", label: "空白状态" }, { value: "loading", label: "加载中" }, { value: "error", label: "异常状态" }, { value: "skeleton", label: "加载占位" }].map((item) => <Button key={item.value} role="tab" aria-selected={preview === item.value} aria-controls="state-preview" size="sm" variant={preview === item.value ? "secondary" : "ghost"} onClick={() => setPreview(item.value as PreviewState)}>{item.label}</Button>)}</div><div id="state-preview" role="tabpanel" aria-label={`${({ empty: "空白", loading: "加载", error: "异常", skeleton: "加载占位" })[preview]}状态预览`} className="mt-4 min-h-64 rounded-xl border border-border bg-card p-5 sm:p-6">{preview === "empty" && <EmptyState icon={FolderOpen} title="这里还没有资料" description="开始导入一份文件，逐步建立你的知识空间。" />}{preview === "loading" && <div className="flex min-h-52 items-center justify-center"><LoadingState label="加载界面示例" /></div>}{preview === "error" && <ErrorState title="暂时无法加载资料" description="这是一条界面异常示例。真实请求发生异常时，会在这里说明原因并提供重试。" onRetry={() => setPreview("empty")} />}{preview === "skeleton" && <PageSkeleton rows={3} />}</div></section>}
    </div>
  );
}
