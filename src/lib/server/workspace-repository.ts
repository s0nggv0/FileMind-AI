import "server-only";
import { z } from "zod";
import { getSupabase } from "./supabase";
import { DatabaseTimestampSchema, WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "@/lib/workspace/schemas";
import { WorkspaceError } from "@/lib/workspace/authorization";
import type { WorkspaceRepository } from "@/lib/workspace/repository";

function failure(error: { message: string } | null) {
  if (!error) return;
  if (error.message.includes("revision_conflict")) throw new WorkspaceError("CONFLICT", "Workspace changed in another tab. Reload to recover the latest version.", 409);
  if (error.message.includes("not_found") || error.message.includes("not_owned")) throw new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
  throw new WorkspaceError("UNAVAILABLE", "Workspace storage is temporarily unavailable.", 503);
}
export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  async create(userId: string, name: string) {
    const db = getSupabase();
    failure((await db.from("profiles").upsert({ id: userId })).error);
    const snapshot: WorkspaceSnapshot = { id: crypto.randomUUID(), name, revision: 0, documents: [], run: null, proposal: null, texts: {}, updatedAt: new Date().toISOString() };
    failure((await db.from("workspaces").insert({ id: snapshot.id, user_id: userId, name, snapshot })).error);
    return snapshot;
  }
  async get(userId: string, id: string) {
    const db = getSupabase();
    const workspace = await db.from("workspaces").select("snapshot,revision,updated_at").eq("user_id", userId).eq("id", id).maybeSingle(); failure(workspace.error);
    if (!workspace.data) throw new WorkspaceError("NOT_FOUND", "Workspace not found.", 404);
    const docs = await db.from("documents").select("id,text_content,storage_path").eq("user_id", userId).eq("workspace_id", id); failure(docs.error);
    const row = z.object({ snapshot: z.record(z.string(), z.unknown()), revision: z.number(), updated_at: DatabaseTimestampSchema }).parse(workspace.data);
    const textRows = z.array(z.object({ id: z.uuid(), text_content: z.string(), storage_path: z.string().nullable() })).parse(docs.data);
    const snapshot = WorkspaceSnapshotSchema.parse({ ...row.snapshot, revision: row.revision, updatedAt: row.updated_at, texts: Object.fromEntries(textRows.map(d => [d.id, d.text_content])) });
    snapshot.documents = snapshot.documents.map(d => ({ ...d, storagePath: textRows.find(row => row.id === d.id)?.storage_path ?? d.storagePath }));
    return snapshot;
  }
  async list(userId: string) {
    const result = await getSupabase().from("workspaces").select("snapshot,revision,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50); failure(result.error);
    const rows = z.array(z.object({ snapshot: z.record(z.string(), z.unknown()), revision: z.number(), updated_at: DatabaseTimestampSchema })).parse(result.data);
    return rows.map(row => WorkspaceSnapshotSchema.parse({ ...row.snapshot, revision: row.revision, updatedAt: row.updated_at, texts: {} }));
  }
  async save(userId: string, snapshot: WorkspaceSnapshot) {
    const checked = WorkspaceSnapshotSchema.parse(snapshot);
    const result = await getSupabase().rpc("save_workspace", { p_user: userId, p_snapshot: checked, p_expected: checked.revision }); failure(result.error);
    return { ...checked, revision: z.number().int().parse(result.data), updatedAt: new Date().toISOString() };
  }
}
export const workspaceRepository = new SupabaseWorkspaceRepository();
