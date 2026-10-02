"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, RotateCcw, WandSparkles } from "lucide-react";
import { DocumentTypeIcon } from "@/components/common/document-type-icon";
import { Button } from "@/components/ui/button";
import { useMotionPreference } from "@/hooks/use-motion-preference";
import type { DocumentType } from "@/types";

export function OrganizeDemo({ examples }: { examples: { before: string; after: string; type: DocumentType }[] }) {
  const [organized, setOrganized] = useState(false);
  const reducedMotion = useMotionPreference();
  return (
    <div className="surface-secondary p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between"><span className="text-xs text-muted-foreground">{organized ? "After · 命名建议" : "Before · 散落的文件"}</span><Button variant="ghost" size="sm" onClick={() => setOrganized(!organized)} aria-label={organized ? "还原命名演示" : "整理命名演示"}>{organized ? <RotateCcw /> : <WandSparkles />}{organized ? "Reset" : "Organize"}</Button></div>
      <div aria-live="polite">
        {examples.map((example) => <motion.div key={example.before} layout={!reducedMotion} className="flex items-center gap-3 border-b py-3 last:border-0" animate={{ x: organized && !reducedMotion ? 4 : 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }}><DocumentTypeIcon type={example.type} /><span className="min-w-0 flex-1 truncate text-xs sm:text-sm">{organized ? example.after : example.before}</span>{organized && <ArrowRight size={14} className="text-primary" />}</motion.div>)}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">预设命名示例 · 实际更改需要你审阅。</p>
    </div>
  );
}
