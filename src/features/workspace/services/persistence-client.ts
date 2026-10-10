import { z } from "zod";
import type { AgentRun, OrganizationPlan, ParsedDocument } from "@/types/workspace";
import { WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "@/lib/workspace/schemas";
import { getDocumentContent, getOriginalFile, restoreDocumentContent } from "./file-parser";

export async function requestJSON(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init?.headers }, cache: "no-store" });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(z.object({ error: z.string() }).safeParse(value).data?.error ?? "工作区服务暂时不可用。");
  return value;
}
export class PersistenceClient {
  persistent = false; label = "仅本地演示"; intelligence = false; competition = false;
  snapshot: WorkspaceSnapshot | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private serial<T>(task: () => Promise<T>): Promise<T> { const result = this.queue.then(task); this.queue = result.catch(() => {}); return result; }
  async initialize(id?: string) {
    const config = z.object({ persistent: z.boolean(), intelligence: z.boolean(), label: z.string(), competition: z.boolean().optional().default(false) }).parse(await requestJSON("/api/workspace-config"));
    Object.assign(this, config);
    if (id && !config.persistent) throw new Error("配置持久化存储后才能恢复已保存工作区。");
    if (id) { this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON(`/api/workspaces/${id}`)); for (const d of this.snapshot.documents) { d.contentRef = d.id; restoreDocumentContent(d.id, this.snapshot.texts[d.id] ?? ""); } }
    return { snapshot: this.snapshot, persistent: this.persistent, label: this.label };
  }
  async prepare(documents: ParsedDocument[]) {
    if (!this.persistent) return;
    await this.serial(async () => {
      if (!this.snapshot) {
        this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON("/api/workspaces", { method: "POST", body: JSON.stringify({ name: documents[0]?.name.replace(/\.[^.]+$/, "") || "我的工作区" }) }));
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
  async analyzeImages() {
    if (!this.snapshot?.documents.some(d => d.type === "image")) return [] as string[];
    const result = z.object({ snapshot: WorkspaceSnapshotSchema, activity: z.array(z.string()) }).parse(await requestJSON("/api/multimodal", { method: "POST", body: JSON.stringify({ workspaceId: this.snapshot.id }) }));
    this.snapshot = result.snapshot;
    for (const d of result.snapshot.documents) restoreDocumentContent(d.id, result.snapshot.texts[d.id] ?? "");
    return result.activity;
  }
  saveProposal(proposal: OrganizationPlan) {
    if (!this.persistent || !this.snapshot) return Promise.resolve();
    return this.serial(async () => { this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON(`/api/workspaces/${this.snapshot!.id}`, { method: "PATCH", body: JSON.stringify({ action: "review", revision: this.snapshot!.revision, proposal }) })); });
  }
  apply(proposal: OrganizationPlan) {
    return this.serial(async () => {
      if (!this.snapshot) throw new Error("工作区尚未保存。");
      this.snapshot = WorkspaceSnapshotSchema.parse(await requestJSON(`/api/workspaces/${this.snapshot.id}`, { method: "PATCH", body: JSON.stringify({ action: "apply", revision: this.snapshot.revision, proposal }) }));
      return this.snapshot.run!;
    });
  }
  reset() { this.snapshot = null; if (typeof window !== "undefined") window.history.replaceState(null, "", "/workspace"); }
}
