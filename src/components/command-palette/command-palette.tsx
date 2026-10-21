"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Settings } from "lucide-react";
import { navItems } from "@/lib/navigation";
import { useUiStore } from "@/store/ui-store";
import { useCommandShortcut } from "@/hooks/use-command-shortcut";
import { navIcons } from "@/components/shell/nav-icons";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";

export function CommandPalette() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [documents, setDocuments] = useState<{ id: string; name: string; summary: string; tags: string[] }[]>([]);
  const [error, setError] = useState("");
  const commandOpen = useUiStore((state) => state.commandOpen);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  useCommandShortcut();
  useEffect(() => {
    if (!commandOpen) return; const abort = new AbortController();
    void fetch("/api/documents", { signal: abort.signal }).then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { setDocuments(data.documents ?? []); setError(""); }).catch(() => { if (!abort.signal.aborted) setError("资料列表暂时不可用，可转到正文搜索。"); });
    return () => abort.abort();
  }, [commandOpen]);
  const navigate = (href: string) => { setCommandOpen(false); router.push(href); };
  return <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
    <DialogContent className="top-[22%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0" showCloseButton={false}>
      <DialogTitle className="sr-only">搜索与导航</DialogTitle><DialogDescription className="sr-only">搜索自己的资料和页面，使用上下方向键选择，按 Enter 前往。</DialogDescription>
      <Command><CommandInput value={query} onValueChange={setQuery} placeholder="查找自己的资料，或前往页面…" aria-label="搜索自己的资料和页面" /><CommandList><CommandEmpty>没有名称匹配，可转到正文搜索。</CommandEmpty><CommandGroup heading="前往页面">{navItems.map((item) => { const Icon = navIcons[item.iconKey]; return <CommandItem key={item.href} value={`${item.label} ${item.description}`} onSelect={() => navigate(item.href)}><Icon /><span>{item.label}</span><span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{item.description}</span></CommandItem>; })}<CommandItem value="设置 偏好" onSelect={() => navigate("/settings")}><Settings />设置</CommandItem><CommandItem value="使用帮助 为什么搜不到 云服务 换浏览器 备份 迁移" onSelect={() => navigate("/settings#help")}><Settings />任务帮助</CommandItem></CommandGroup><CommandSeparator /><CommandGroup heading="我的资料 · 名称、摘要、标签">{documents.map((document) => <CommandItem key={document.id} value={`${document.name} ${document.summary} ${document.tags.join(" ")}`} onSelect={() => navigate(`/library?source=workspace&document=${encodeURIComponent(document.id)}`)}><FileText /><span className="truncate">{document.name}</span></CommandItem>)}</CommandGroup>{query.trim() && !documents.some(d => [d.name,d.summary,...d.tags].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && <CommandGroup forceMount heading="继续查找"><CommandItem forceMount value="full-text-search" onSelect={() => navigate(`/search?mode=find&q=${encodeURIComponent(query)}`)}><FileText />搜索资料正文：{query}</CommandItem></CommandGroup>}</CommandList></Command>
      {query.trim() && <button type="button" onClick={() => navigate(`/search?mode=find&q=${encodeURIComponent(query)}`)} className="min-h-11 border-t px-4 text-left text-sm text-primary">转到正文搜索：{query}</button>}
      {error && <p role="status" className="px-4 py-2 text-xs text-muted-foreground">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2 border-t px-4 py-3 text-[11px] text-muted-foreground"><span>↑ ↓ 选择 · Enter 前往</span><span>Esc 关闭 · 仅当前身份的资料</span></div>
    </DialogContent>
  </Dialog>;
}
