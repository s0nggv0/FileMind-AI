import "server-only";
import { z } from "zod";
import { formatFileSize } from "@/config/upload";
import type { DemoDocument } from "@/types";
import { getUserId } from "./identity";
import { getSupabase, persistenceConfigured } from "./supabase";
import { workspaceRepository } from "./workspace-repository";
export async function getWorkspacePresentation() {
  // Always read request identity: pages must not freeze empty data at build time.
  const persistent = persistenceConfigured(); const user = await getUserId();
  if (!persistent || !user) return { persistent, workspaces: [], documents: [] as DemoDocument[], plans: [], totalDocuments: 0, totalWorkspaces: 0 };
  const workspaces = await workspaceRepository.list(user);
  const db = getSupabase();
  const counts = await Promise.all([
    db.from("workspaces").select("id", { count: "exact", head: true }).eq("user_id", user),
    db.from("documents").select("id", { count: "exact", head: true }).eq("user_id", user),
  ]);
  if (counts.some(result => result.error || result.count === null)) throw new Error("Workspace counts are temporarily unavailable.");
  const response = await db.from("documents").select("id,display_name,file_type,file_size,summary,category,created_at,updated_at,document_tags(tag)").eq("user_id", user).order("created_at", { ascending: false }).limit(1500);
  if (response.error) throw new Error("Workspace library is temporarily unavailable.");
  const rows = z.array(z.object({ id: z.uuid(), display_name: z.string(), file_type: z.enum(["pdf", "docx", "txt", "md", "image"]), file_size: z.number(), summary: z.string().nullable(), category: z.string().nullable(), created_at: z.string(), updated_at: z.string(), document_tags: z.array(z.object({ tag: z.string() })) })).parse(response.data);
  const plans = workspaces.flatMap(w => w.run?.status === "completed" && w.run.result ? [{ ...w.run.result, relationships: w.run.result.relationships.filter(r => r.decision !== "ignored") }] : []);
  const documents: DemoDocument[] = rows.map(d => ({ id: d.id, name: d.display_name, type: d.file_type, size: formatFileSize(d.file_size), summary: d.summary ?? "Document stored. Apply an organization plan to save its summary, category and tags.", category: d.category ?? "Uncategorized", tags: d.document_tags.map(t => t.tag), updatedAt: d.created_at.slice(0, 10), relations: plans.flatMap(p => p.relationships).filter(r => r.source === d.id || r.target === d.id).length }));
  return { persistent, workspaces, documents, plans, totalDocuments: counts[1].count!, totalWorkspaces: counts[0].count! };
}
