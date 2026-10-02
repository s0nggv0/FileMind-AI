"use client";

import Link from "next/link";
import { Check, Library, Network, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OrganizationPlan } from "@/types/workspace";
import { useWorkspaceStore } from "../store/workspace-store";

export function CompletionState({ plan }: { plan: OrganizationPlan }) {
  const reset = useWorkspaceStore((state) => state.reset);
  const persistent = useWorkspaceStore((state) => state.persistent);
  return <section className="py-12 text-center sm:py-20" role="status"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-primary"><Check size={26} /></span><h2 className="mt-6 text-3xl font-medium">Workspace organized</h2><div className="mt-5 space-y-2 text-sm text-muted-foreground"><p>{plan.documents.length} documents organized</p><p>{new Set(plan.documents.map((document) => document.category)).size} categories created</p><p>{plan.relationships.length} rule-based knowledge connections</p><p>{plan.duplicates.filter((item) => item.decision === "accepted").length} duplicate candidate groups marked · all files kept</p></div><p className="mt-6 text-xs text-muted-foreground">{persistent ? "Your workspace is saved. Refresh to restore these results. Original files are kept." : "Your plan lives in this browser session. Original files were not changed."}</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Button asChild><Link href="/library?source=workspace"><Library size={16} />View Library</Link></Button><Button asChild variant="outline"><Link href="/graph?source=workspace"><Network size={16} />Explore Knowledge Graph</Link></Button><Button variant="ghost" onClick={reset}><Plus size={16} />Start another workspace</Button></div></section>;
}
