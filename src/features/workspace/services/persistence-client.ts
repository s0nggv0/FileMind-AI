import { z } from "zod";
import type { AgentRun, OrganizationPlan, ParsedDocument } from "@/types/workspace";
import { WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "@/lib/workspace/schemas";
import { getDocumentContent, getOriginalFile, restoreDocumentContent } from "./file-parser";

export async function requestJSON(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init?.headers }, cache: "no-store" });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(z.object({ error: z.string() }).safeParse(value).data?.error ?? "Workspace service is unavailable.");
  return value;
}
export class PersistenceClient {
  persistent = false; label = "Local-only Demo"; intelligence = false;
  snapshot: WorkspaceSnapshot | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private serial<T>(task: () => Promise<T>): Promise<T> { const result = this.queue.then(task); this.queue = result.catch(() => {}); return result; }
  async initialize(id?: string) {
    const config = z.object({ persistent: z.boolean(), intelligence: z.boolean(), label: z.string() }).parse(await requestJSON("/api/workspace-config"));
    Object.assign(this, config);
    if (id && !config.persistent) throw new Error("Set up persistent storage to restore saved workspaces.");
    if (id) { this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON(`/api/workspaces/${id}`)); for (const d of this.snapshot.documents) { d.contentRef = d.id; restoreDocumentContent(d.id, this.snapshot.texts[d.id] ?? ""); } }
    return { snapshot: this.snapshot, persistent: this.persistent, label: this.label };
  }
  async prepare(documents: ParsedDocument[]) {
    if (!this.persistent) return;
    await this.serial(async () => {
      if (!this.snapshot) {
        this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON("/api/workspaces", { method: "POST", body: JSON.stringify({ name: documents[0]?.name.replace(/\.[^.]+$/, "") || "My workspace" }) }));
        window.history.replaceState(null, "", `/workspace?workspace=${this.snapshot.id}`);
      } else if (this.snapshot.run) {
        this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON(`/api/workspaces/${this.snapshot.id}`, { method: "PATCH", body: JSON.stringify({ action: "resume", revision: this.snapshot.revision }) }));
      }
      this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON(`/api/workspaces/${this.snapshot.id}`, { method: "PUT", body: JSON.stringify({ ...this.snapshot, documents, run: null, proposal: null, texts: Object.fromEntries(documents.map(d => [d.id, getDocumentContent(d)])) }) }));
      for (const document of documents) {
        if (document.storagePath) continue; const file = getOriginalFile(document.id); if (!file) continue;
        const form = new FormData(); form.set("documentId", document.id); form.set("file", file);
        this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON(`/api/workspaces/${this.snapshot.id}/files`, { method: "POST", body: form }));
      }
      for (const document of documents) document.storagePath = this.snapshot.documents.find(d => d.id === document.id)?.storagePath;
    });
  }
  saveRun(run: AgentRun) {
    if (!this.persistent || !this.snapshot) return Promise.resolve();
    const copy = structuredClone(run);
    return this.serial(async () => {
      this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON(`/api/workspaces/${this.snapshot!.id}`, { method: "PUT", body: JSON.stringify({ ...this.snapshot, documents: copy.documents, run: copy, proposal: copy.result ?? null }) }));
    });
  }
  saveProposal(proposal: OrganizationPlan) {
    if (!this.persistent || !this.snapshot) return Promise.resolve();
    return this.serial(async () => { this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON(`/api/workspaces/${this.snapshot!.id}`, { method: "PATCH", body: JSON.stringify({ action: "review", revision: this.snapshot!.revision, proposal }) })); });
  }
  apply(proposal: OrganizationPlan) {
    return this.serial(async () => {
      if (!this.snapshot) throw new Error("Workspace has not been saved.");
      this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON(`/api/workspaces/${this.snapshot.id}`, { method: "PATCH", body: JSON.stringify({ action: "apply", revision: this.snapshot.revision, proposal }) }));
      return this.snapshot.run!;
    });
  }
  reset() { this.snapshot = null; if (typeof window !== "undefined") window.history.replaceState(null, "", "/workspace"); }
}
