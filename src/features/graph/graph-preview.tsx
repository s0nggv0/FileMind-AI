"use client";

import { useState } from "react";
import { ArrowRight, FileText, Link2, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DocumentViewModel, GraphEdgeViewModel, GraphNodeViewModel } from "@/types";

export function GraphPreview({ nodes, edges, documents, dataset = "example" }: { nodes: GraphNodeViewModel[]; edges: GraphEdgeViewModel[]; documents: DocumentViewModel[]; dataset?: "example" | "workspace" }) {
  const [selectedId, setSelectedId] = useState(nodes.find((node) => node.kind === "concept")?.id ?? nodes[0]?.id);
  const selected = nodes.find((node) => node.id === selectedId);
  const document = documents.find((item) => item.id === selected?.documentId);
  const connections = edges.filter((edge) => edge.source === selectedId || edge.target === selectedId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" />概念</span><span className="flex items-center gap-2"><span className="size-2 rounded-sm border border-muted-foreground" />文件</span></div><span className="text-xs text-muted-foreground">{nodes.length} 个节点 · {edges.length} 条{dataset === "workspace" ? "规则" : "示例"}关联</span></div>
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4"><Network size={16} className="text-primary" /><h2 className="text-sm font-medium">点选一个节点，沿着连接继续探索。</h2></div>
          <div className="overflow-x-auto bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[22px_22px]">
            <svg viewBox="0 0 900 500" className="min-w-150 w-full" aria-label={dataset === "workspace" ? "本地规则知识图谱，支持鼠标点击或 Tab 与 Enter 选择节点" : "示例知识图谱，支持鼠标点击或 Tab 与 Enter 选择节点"} role="group">
              {edges.map((edge) => {
                const source = nodes.find((node) => node.id === edge.source);
                const target = nodes.find((node) => node.id === edge.target);
                if (!source || !target) return null;
                const active = edge.source === selectedId || edge.target === selectedId;
                return <g key={`${edge.source}-${edge.target}`} aria-hidden="true"><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={cn(active ? "stroke-primary/50" : "stroke-border")} strokeWidth={active ? 1.5 : 1} />{active && <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]" paintOrder="stroke" stroke="var(--card)" strokeWidth={4} strokeLinejoin="round">{edge.label}</text>}</g>;
              })}
              {nodes.map((node) => {
                const active = node.id === selectedId;
                return <g key={node.id} role="button" tabIndex={0} aria-label={`${node.kind === "concept" ? "概念" : "文件"}：${node.label}`} aria-pressed={active} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(node.id); } }} className="group cursor-pointer outline-none">
                  {node.kind === "concept" ? <circle cx={node.x} cy={node.y} r={38} className={cn("transition-colors group-focus-visible:stroke-primary group-focus-visible:stroke-3", active ? "fill-primary stroke-primary" : "fill-background stroke-primary/35 group-hover:fill-muted")} strokeWidth={1.5} /> : <rect x={node.x - 81} y={node.y - 24} width={162} height={48} rx={10} className={cn("transition-colors group-focus-visible:stroke-primary group-focus-visible:stroke-3", active ? "fill-primary/10 stroke-primary" : "fill-card stroke-border group-hover:fill-muted")} strokeWidth={1.5} />}
                  <text x={node.x} y={node.y + 4} textAnchor="middle" className={cn("pointer-events-none text-[12px]", node.kind === "concept" && active ? "fill-primary-foreground font-medium" : "fill-foreground")}>{node.label}</text>
                </g>;
              })}
            </svg>
          </div>
          <p className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">{dataset === "workspace" ? "本地工作区关联 · 根据共同分类和标签生成" : "知识关联预览 · 选择节点查看资料与概念的联系。"}</p>
        </section>
        <aside className="border-t border-border p-5 xl:border-l xl:border-t-0" aria-live="polite">
          {selected ? <div><Badge variant="secondary">{selected.kind === "concept" ? "概念节点" : "文件节点"}</Badge><h3 className="mt-4 text-lg font-medium leading-7">{selected.label}</h3><p className="mt-3 text-xs leading-6 text-muted-foreground">{document?.summary ?? "这个概念连接了不同文件中的主题。以下关联来自预置演示数据。"}</p>{document && <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><FileText size={14} /> {document.category} · {document.size}</div>}<div className="mt-6 border-t border-border pt-5"><p className="mb-4 flex items-center gap-2 text-xs font-medium"><Link2 size={14} /> 关联节点 · {connections.length}</p><div className="space-y-2">{connections.map((edge) => {
            const other = nodes.find((node) => node.id === (edge.source === selectedId ? edge.target : edge.source));
            return other ? <button key={`${edge.source}-${edge.target}`} onClick={() => setSelectedId(other.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"><div className="min-w-0 flex-1"><p className="truncate text-xs">{other.label}</p><p className="mt-1 text-[10px] text-muted-foreground">{edge.label}</p></div><ArrowRight size={13} className="text-muted-foreground" /></button> : null;
          })}</div></div></div> : <p className="text-sm text-muted-foreground">选择节点查看示例关联。</p>}
        </aside>
      </div>
    </div>
  );
}
