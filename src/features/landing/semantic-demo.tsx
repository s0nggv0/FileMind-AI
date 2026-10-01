"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentTypeIcon } from "@/components/common/document-type-icon";
import type { DocumentType } from "@/types";

export function SemanticDemo({ example }: { example: { query: string; results: { name: string; excerpt: string; type: DocumentType }[] } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="surface-secondary p-5 sm:p-6">
      <p className="text-[11px] text-muted-foreground">示例问题</p>
      <p className="my-3 text-sm leading-6">“{example.query}”</p>
      <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}><Search />{expanded ? "收起结果" : "Search demo"}</Button>
      <div className="mt-4 min-h-28" aria-live="polite">
        {expanded ? <><p className="mb-2 font-mono text-[11px] text-primary">{example.results.length} results · 预设语义匹配</p>{example.results.map((result) => <div key={result.name} className="flex items-start gap-3 border-t py-2.5"><DocumentTypeIcon type={result.type} /><div><p className="text-xs font-medium">{result.name}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{result.excerpt}</p></div></div>)}</> : <p className="pt-5 text-xs leading-6 text-muted-foreground">不记得文件名？<br />从记得的内容，找回学习的线索。</p>}
      </div>
    </div>
  );
}
