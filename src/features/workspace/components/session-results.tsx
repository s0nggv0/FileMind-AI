"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { LibraryBrowser } from "@/features/library/library-browser";
import { GraphPreview } from "@/features/graph/graph-preview";
import { useWorkspaceStore } from "../store/workspace-store";
import { sessionDocuments, sessionGraph } from "../services/session-presentation";
import type { DemoDocument, DemoGraphNode, DemoGraphEdge } from "@/types";

function SourceSwitch({ local, onChange, count }: { local: boolean; onChange: (local: boolean) => void; count: number }) {
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Data source"><Button size="sm" variant={local ? "secondary" : "ghost"} aria-pressed={local} onClick={() => onChange(true)}>This session · {count} files</Button><Button size="sm" variant={!local ? "secondary" : "ghost"} aria-pressed={!local} onClick={() => onChange(false)}>Example workspace</Button></div>;
}
export function SessionLibrary({ documents, categories, initialSelectedId, preferSession }: { documents: DemoDocument[]; categories: string[]; initialSelectedId?: string; preferSession: boolean }) {
  const applied = useWorkspaceStore((state) => state.applied);
  const [local, setLocal] = useState(preferSession);
  const imported = sessionDocuments(applied);
  const groups = applied.flatMap((plan) => plan.duplicates.filter((item) => item.decision === "accepted").map((item) => item.documentIds.map((id) => plan.documents.find((document) => document.id === id)?.name).join(" ↔ ")));
  return <div className="space-y-5"><SourceSwitch local={local} onChange={setLocal} count={imported.length} />{local ? imported.length ? <><p className="text-xs text-muted-foreground">Locally parsed files · organization uses demo rules · refresh clears this session.</p>{groups.length > 0 && <details className="rounded-lg bg-muted p-4 text-xs"><summary className="cursor-pointer">{groups.length} accepted duplicate candidate groups · all files kept</summary><ul className="mt-3 space-y-2">{groups.map((group, index) => <li key={index} className="break-words">{group}</li>)}</ul></details>}<LibraryBrowser key="session" documents={imported} categories={[...new Set(imported.map((document) => document.category))]} dataset="workspace" /></> : <EmptyState title="Your session Library is empty" description="Apply a workspace plan to see your own documents here."><Button asChild><Link href="/workspace">Open Workspace</Link></Button></EmptyState> : <LibraryBrowser key={initialSelectedId ?? "example"} documents={documents} categories={categories} initialSelectedId={initialSelectedId} />}</div>;
}
export function SessionGraph({ nodes, edges, documents, preferSession }: { nodes: DemoGraphNode[]; edges: DemoGraphEdge[]; documents: DemoDocument[]; preferSession: boolean }) {
  const applied = useWorkspaceStore((state) => state.applied); const [local, setLocal] = useState(preferSession); const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const index = selectedIndex ?? applied.length - 1; const plan = applied[index];
  const graph = plan ? sessionGraph(plan) : null;
  return <div className="space-y-5"><SourceSwitch local={local} onChange={setLocal} count={sessionDocuments(applied).length} />{local ? graph && plan ? <>{applied.length > 1 && <label className="flex items-center gap-3 text-xs">Workspace run<select aria-label="Workspace run" className="min-h-11 rounded-lg border bg-card px-3" value={index} onChange={(event) => setSelectedIndex(Number(event.target.value))}>{applied.map((item, position) => <option key={position} value={position}>Run {position + 1} · {item.documents.length} files</option>)}</select></label>}<p className="text-xs text-muted-foreground">Connections use shared tags and categories, without semantic similarity. {graph.edges.length === 0 && "No shared topic was found; your files are shown as standalone nodes."}</p><GraphPreview key={`session-${index}`} nodes={graph.nodes} edges={graph.edges} documents={sessionDocuments([plan])} dataset="workspace" /></> : <EmptyState title="No workspace connections yet" description="Organize your files and apply the plan to explore their rule-based connections."><Button asChild><Link href="/workspace">Open Workspace</Link></Button></EmptyState> : <GraphPreview key="example" nodes={nodes} edges={edges} documents={documents} />}</div>;
}
