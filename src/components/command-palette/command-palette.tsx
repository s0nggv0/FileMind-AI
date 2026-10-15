"use client";

import { useRouter } from "next/navigation";
import { FileText, Settings } from "lucide-react";
import { navItems } from "@/lib/navigation";
import { getDemoDocuments } from "@/lib/demo/repository";
import { useUiStore } from "@/store/ui-store";
import { useCommandShortcut } from "@/hooks/use-command-shortcut";
import { navIcons } from "@/components/shell/nav-icons";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";

export function CommandPalette() {
  const router = useRouter();
  const commandOpen = useUiStore((state) => state.commandOpen);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  useCommandShortcut();
  const navigate = (href: string) => { setCommandOpen(false); router.push(href); };
  return <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
    <DialogContent className="top-[22%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0" showCloseButton={false}>
      <DialogTitle className="sr-only">搜索与导航</DialogTitle><DialogDescription className="sr-only">搜索页面和演示资料，使用上下方向键选择，按 Enter 前往。</DialogDescription>
      <Command><CommandInput placeholder="前往页面，或查找演示资料…" aria-label="搜索页面和演示资料" /><CommandList><CommandEmpty>没有找到结果，试试工作区或资料名称。</CommandEmpty><CommandGroup heading="前往页面">{navItems.map((item) => { const Icon = navIcons[item.iconKey]; return <CommandItem key={item.href} value={`${item.label} ${item.description}`} onSelect={() => navigate(item.href)}><Icon /><span>{item.label}</span><span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{item.description}</span></CommandItem>; })}<CommandItem value="设置 偏好" onSelect={() => navigate("/settings")}><Settings />设置</CommandItem></CommandGroup><CommandSeparator /><CommandGroup heading="演示资料">{getDemoDocuments().slice(0, 4).map((document) => <CommandItem key={document.id} value={`${document.name} ${document.tags.join(" ")}`} onSelect={() => navigate(`/library?document=${encodeURIComponent(document.id)}`)}><FileText /><span className="truncate">{document.name}</span></CommandItem>)}</CommandGroup></CommandList></Command>
      <div className="flex flex-wrap justify-between gap-2 border-t px-4 py-3 text-[11px] text-muted-foreground"><span>↑ ↓ 选择 · Enter 前往</span><span>Esc 关闭 · 本地示例导航</span></div>
    </DialogContent>
  </Dialog>;
}
