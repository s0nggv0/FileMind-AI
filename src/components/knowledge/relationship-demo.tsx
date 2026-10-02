"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useMotionPreference } from "@/hooks/use-motion-preference";
import type { RelationshipEdge, RelationshipNode } from "@/types/presentation";

type RelationshipDemoProps = {
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
  compact?: boolean;
};

export function RelationshipDemo({ nodes, edges, compact = false }: RelationshipDemoProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const reducedMotion = useMotionPreference();
  const active = hovered ?? selected;
  const shownNodes = compact ? nodes.filter((node) => node.mobile) : nodes;
  const visibleEdges = edges.filter((edge) => shownNodes.some((node) => node.id === edge.source) && shownNodes.some((node) => node.id === edge.target));
  const connected = new Set(visibleEdges.filter((edge) => edge.source === active || edge.target === active).flatMap((edge) => [edge.source, edge.target]));
  const activeNode = nodes.find((node) => node.id === active);

  return (
    <div>
      <div className={cn("relative", compact ? "h-48" : "h-80 sm:h-96")} aria-label="知识关联演示">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          {visibleEdges.map((edge, index) => {
            const source = shownNodes.find((node) => node.id === edge.source)!;
            const target = shownNodes.find((node) => node.id === edge.target)!;
            const highlight = edge.source === active || edge.target === active;
            return <motion.path key={`${edge.source}-${edge.target}`} d={`M ${source.x} ${source.y} L ${target.x} ${target.y}`} fill="none" vectorEffect="non-scaling-stroke" stroke="currentColor" strokeWidth={highlight ? 1.8 : 1.25} className={cn(highlight ? "text-primary" : "text-muted-foreground/70", !compact && (!source.mobile || !target.mobile) && "max-sm:hidden")} initial={{ opacity: reducedMotion ? 1 : 0.35 }} animate={reducedMotion ? { opacity: 1 } : undefined} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: reducedMotion ? 0 : 0.4, delay: reducedMotion ? 0 : index * 0.08 }} />;
          })}
        </svg>
        {shownNodes.map((node, index) => (
          <div key={node.id} style={{ left: `${node.x}%`, top: `${node.y}%` }} className={cn("absolute -translate-x-1/2 -translate-y-1/2", !compact && !node.mobile && "max-sm:hidden")}>
            <motion.button type="button" initial={{ opacity: 1, y: reducedMotion ? 0 : 4 }} whileInView={{ y: 0 }} viewport={{ once: true }} transition={{ duration: reducedMotion ? 0 : 0.2, delay: reducedMotion ? 0 : index * 0.08 }} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(node.id)} onBlur={() => setHovered(null)} onClick={() => setSelected(selected === node.id ? null : node.id)} aria-pressed={selected === node.id} className={cn("flex min-h-11 items-center gap-2 whitespace-nowrap rounded-interactive border bg-card px-3 text-xs transition-colors", connected.has(node.id) || active === node.id ? "border-primary text-primary" : "border-border")}>
              <span className={cn("size-1.5 rounded-full", node.id === "transformer" ? "bg-primary" : "bg-muted-foreground/50")} />{node.label}
            </motion.button>
          </div>
        ))}
      </div>
      <p className="min-h-10 px-3 pt-3 text-center text-[11px] text-muted-foreground" aria-live="polite">{activeNode ? `${activeNode.label} · ${visibleEdges.filter((edge) => edge.source === active || edge.target === active).length} 条示例关联` : "悬停、聚焦或点击节点，查看关联"}</p>
    </div>
  );
}
