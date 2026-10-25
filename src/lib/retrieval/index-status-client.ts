import { indexStatusURL, type IndexScope, type IndexStatusPage } from "./index-status";
import { readiness } from "./readiness";

interface Snapshot { data: IndexStatusPage | null; error: string }
export interface StatusRuntime {
  visible(): boolean;
  listen(refresh: () => void): () => void;
  schedule(work: () => void, delay: number): ReturnType<typeof setTimeout>;
  cancel(timer: ReturnType<typeof setTimeout>): void;
}
const runtime: StatusRuntime = {
  visible: () => typeof document === "undefined" || document.visibilityState !== "hidden",
  listen: refresh => {
    if (typeof document === "undefined") return () => {};
    document.addEventListener("visibilitychange", refresh); window.addEventListener("focus", refresh);
    return () => { document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  },
  schedule: (work, delay) => setTimeout(work, delay), cancel: timer => clearTimeout(timer),
};
export async function readIndexPage(scope: IndexScope, transport: typeof fetch, cursor?: string, signal?: AbortSignal): Promise<IndexStatusPage> {
  const timeout = AbortSignal.timeout(30000);
  const response = await transport(indexStatusURL(scope, cursor), { cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error("暂时无法确认资料准备状态，请稍后重试。");
  const data = await response.json() as IndexStatusPage;
  const documents = data.documents.filter(d => (!scope.workspaceId || d.workspaceId === scope.workspaceId) && (!scope.documentIds || scope.documentIds.includes(d.id)));
  return { ...data, documents, summary: data.summary ?? readiness(documents), nextCursor: data.nextCursor ?? null };
}
class StatusEntry {
  private snapshot: Snapshot = { data: null, error: "" };
  private listeners = new Set<() => void>();
  private controller?: AbortController;
  private pending?: Promise<IndexStatusPage>;
  private revision = 0;
  private failures = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private stopListening?: () => void;
  constructor(readonly scope: IndexScope, private transport: typeof fetch, private environment: StatusRuntime) {}
  get active() { return this.listeners.size > 0; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.stopListening = this.environment.listen(() => {
        if (!this.environment.visible()) { this.interrupt(); return; }
        void this.refresh().catch(() => {});
      });
      if (this.environment.visible()) void this.refresh().catch(() => {});
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) { this.interrupt(); this.stopListening?.(); this.stopListening = undefined; this.snapshot = { data: null, error: "" }; }
    };
  };
  private emit() { for (const listener of this.listeners) listener(); }
  interrupt() {
    this.revision++; this.controller?.abort(); this.controller = undefined; this.pending = undefined;
    if (this.timer) this.environment.cancel(this.timer); this.timer = undefined;
  }
  publish(data: IndexStatusPage) {
    this.interrupt(); this.failures = 0; this.snapshot = { data, error: "" }; this.emit(); this.schedule();
  }
  private schedule() {
    if (this.timer) this.environment.cancel(this.timer);
    if (!this.listeners.size || !this.environment.visible()) return;
    if (!this.snapshot.error && !this.snapshot.data?.summary.processing) return;
    this.timer = this.environment.schedule(() => { this.timer = undefined; void this.refresh().catch(() => {}); }, this.failures ? Math.min(30000, 4000 * 2 ** this.failures) : 4000);
  }
  refresh = (): Promise<IndexStatusPage> => {
    if (this.pending) return this.pending;
    if (this.timer) this.environment.cancel(this.timer); this.timer = undefined;
    const controller = new AbortController(); this.controller = controller;
    const revision = ++this.revision;
    const work = readIndexPage(this.scope, this.transport, undefined, controller.signal).then(data => {
      if (controller.signal.aborted || revision !== this.revision) throw new DOMException("Superseded status", "AbortError");
      this.failures = 0; this.snapshot = { data, error: "" }; this.emit(); return data;
    }).catch(error => {
      if (!controller.signal.aborted && revision === this.revision) {
        this.failures++; this.snapshot = { ...this.snapshot, error: "暂时无法确认资料准备状态，请稍后重试。" }; this.emit();
      }
      throw error;
    }).finally(() => {
      if (revision === this.revision) { this.pending = undefined; this.controller = undefined; this.schedule(); }
    });
    this.pending = work;
    return work;
  };
}
export class IndexStatusClient {
  private entries = new Map<string, StatusEntry>();
  constructor(private transport: typeof fetch, private environment: StatusRuntime = runtime) {}
  entry(scope: IndexScope) {
    const normalized = { ...scope, ...(scope.documentIds ? { documentIds: [...new Set(scope.documentIds)].sort() } : {}) };
    const key = indexStatusURL(normalized);
    let entry = this.entries.get(key);
    if (!entry) {
      for (const [oldKey, old] of this.entries) if (this.entries.size >= 64 && !old.active) this.entries.delete(oldKey);
      entry = new StatusEntry(normalized, this.transport, this.environment); this.entries.set(key, entry);
    }
    return entry;
  }
  publish(scope: IndexScope, data: IndexStatusPage) {
    // Refresh mounted overlapping scopes after a user operation, never with
    // guessed POST results. Identical scopes receive the same real snapshot.
    for (const [key, entry] of this.entries) {
      if (!entry.active) continue;
      if (key === indexStatusURL(scope)) entry.publish(data);
      else if ((!scope.workspaceId || !entry.scope.workspaceId || scope.workspaceId === entry.scope.workspaceId) && (!scope.documentIds || !entry.scope.documentIds || scope.documentIds.some(id => entry.scope.documentIds!.includes(id)))) {
        entry.interrupt(); if (this.environment.visible()) void entry.refresh().catch(() => {});
      }
    }
  }
}
export const indexStatusClient = new IndexStatusClient((input, init) => fetch(input, init));
