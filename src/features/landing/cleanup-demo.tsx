"use client";

import { useState } from "react";
import { Check, Files, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CleanupComparison } from "@/types/presentation";

export function CleanupDemo({ comparison, compact = false }: { comparison: CleanupComparison; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"pending" | "ignored" | "kept">("pending");
  return (
    <div className={compact ? "surface-secondary p-5 sm:p-6" : "surface-primary p-5 sm:p-8"}>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><Files size={16} /> Similar documents</span><span className="font-mono text-primary">{comparison.similarity}% similar</span></div>
      <div className="my-5 space-y-3">
        <p className="break-all text-sm">{comparison.original}</p>
        <p className="break-all text-sm font-medium text-primary">{comparison.updated}</p>
      </div>
      {!compact && <div className="mb-6 flex gap-5 border-y py-4 font-mono text-xs text-muted-foreground"><span>+ {comparison.addedWords} words</span><span>+ {comparison.addedReferences} references</span></div>}
      <p className="mb-4 text-xs leading-6 text-muted-foreground">Suggestion: keep the newest version.<br />先对照差异，再决定如何处理。</p>
      {decision === "pending" ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setOpen(true)}>Review</Button><Button size="sm" variant="ghost" onClick={() => setDecision("ignored")}>Ignore</Button></div> : <div className="flex flex-wrap items-center gap-2"><p role="status" className="flex items-center gap-2 text-xs text-primary"><Check size={14} />{decision === "ignored" ? "演示：已忽略建议" : "演示：已确认保留 v2"}</p><Button size="sm" variant="ghost" onClick={() => setDecision("pending")} aria-label="重置清理演示"><RotateCcw />Reset</Button></div>}
      <p className="mt-4 text-[11px] text-muted-foreground">本地演示 · 没有修改或删除真实文件。</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review changes</DialogTitle><DialogDescription>预设版本对照。确认只会更新此演示的状态。</DialogDescription></DialogHeader>
          <div className="space-y-5 py-2">
            <div><p className="break-all text-sm font-medium">{comparison.original}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{comparison.before}</p></div>
            <div className="border-t pt-4"><p className="break-all text-sm font-medium text-primary">{comparison.updated}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{comparison.after}</p></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => { setDecision("kept"); setOpen(false); }}>确认保留 v2 · 演示</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
