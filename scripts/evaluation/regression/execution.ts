import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { PROTOCOL, hash, type Observation } from "./protocol";

export async function exclusiveJSON(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
export class RunStore {
  private constructor(public readonly root: string, private ledger: Awaited<ReturnType<typeof open>>) {}
  static async create(base: string) {
    const root = join(base, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`);
    await mkdir(root, { recursive: true, mode: 0o700 });
    return new RunStore(root, await open(join(root, "events.jsonl"), "wx", 0o600));
  }
  async event(type: string, value: unknown) {
    await this.ledger.writeFile(JSON.stringify({ at: new Date().toISOString(), type, value }) + "\n");
    await this.ledger.sync();
  }
  async attempt(row: Observation) {
    await exclusiveJSON(join(this.root, `${hash(row.questionId).slice(0, 20)}-attempt-${row.attempt}.json`), row);
    await this.event("attempt-completed", row);
  }
  async close() { await this.ledger.close(); }
}
export function assertPrivateInput(path: string, project = process.cwd()) {
  const full = resolve(path), inside = relative(resolve(project, ".filemind/evaluation-input"), full);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new Error("External corpus must stay in ignored .filemind/evaluation-input");
  return full;
}
export interface TransportEvent {
  request: number; phase: string; state: "started" | "completed" | "failed"; latencyMs?: number; status?: number;
  tokens?: { prompt: number | null; completion: number | null; total: number | null } | null;
}
export class RequestBudget {
  readonly events: TransportEvent[] = [];
  phase = "indexing";
  private requests = 0;
  private consecutiveFailures = 0;
  private stopReason: string | null = null;
  private readonly started = performance.now();
  constructor(readonly limits: { maxRequests: number; timeoutMs: number; runTimeoutMs: number; stopAfterFailures: number }, private sink: (event: TransportEvent) => Promise<void>, private transport: typeof fetch = fetch) {
    for (const [key, max] of [["maxRequests", 100], ["timeoutMs", 60000], ["runTimeoutMs", 600000], ["stopAfterFailures", 3]] as const) {
      if (!Number.isInteger(limits[key]) || limits[key] < 1 || limits[key] > max) throw new Error("Invalid live budget");
    }
  }
  stopped() { return this.stopReason !== null || this.requests >= this.limits.maxRequests || performance.now() - this.started >= this.limits.runTimeoutMs; }
  private async record(event: TransportEvent) { this.events.push(event); await this.sink(event); }
  fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !(url.hostname === "api.moonshot.cn" || /^([a-z0-9-]+\.)*(dashscope\.aliyuncs\.com|maas\.aliyuncs\.com)$/.test(url.hostname))) throw new Error("Untrusted evaluation endpoint");
    if (this.stopped()) throw new Error("Evaluation budget stopped");
    const request = ++this.requests, phase = this.phase, started = performance.now();
    await this.record({ request, phase, state: "started" });
    try {
      const inherited = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const signal = AbortSignal.any([...(inherited ? [inherited] : []), AbortSignal.timeout(Math.min(this.limits.timeoutMs, Math.max(1, this.limits.runTimeoutMs - (performance.now() - this.started))))]);
      const response = await this.transport(input, { ...init, redirect: "error", signal });
      // Consume once within the timeout; only aggregate usage is persisted. Never
      // retain provider response bodies, draft answers, headers or credentials.
      const body = await response.text();
      let tokens: TransportEvent["tokens"] = null;
      try {
        const usage = JSON.parse(body).usage;
        const prompt = usage?.prompt_tokens ?? usage?.input_tokens, completion = usage?.completion_tokens ?? usage?.output_tokens;
        const total = usage?.total_tokens ?? (Number.isFinite(prompt) && Number.isFinite(completion) ? prompt + completion : undefined);
        if (Number.isFinite(total) && total >= 0) tokens = { prompt: Number.isFinite(prompt) ? prompt : null, completion: Number.isFinite(completion) ? completion : null, total };
      } catch { /* Token usage is unavailable, not zero. */ }
      if (response.ok) this.consecutiveFailures = 0;
      else if ([401, 403, 429].includes(response.status) || ++this.consecutiveFailures >= this.limits.stopAfterFailures) this.stopReason = "provider-stop";
      await this.record({ request, phase, state: response.ok ? "completed" : "failed", latencyMs: performance.now() - started, status: response.status, tokens });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch {
      if (++this.consecutiveFailures >= this.limits.stopAfterFailures) this.stopReason = "transport-stop";
      await this.record({ request, phase, state: "failed", latencyMs: performance.now() - started, tokens: null });
      throw new Error("Evaluation transport unavailable");
    }
  };
}

export interface ComparableReport { protocol: string; fingerprint: string; rows: Observation[] }
export function assertComparable(a: ComparableReport, b: ComparableReport) {
  if (a.protocol !== PROTOCOL || b.protocol !== PROTOCOL || a.fingerprint !== b.fingerprint) throw new Error("Cannot compare: corpus, gold, scope, adapter or model configuration differs");
}
export async function readReport(path: string): Promise<ComparableReport> { return JSON.parse(await readFile(path, "utf8")); }
export function selectAttempts(rows: Observation[], which: "first" | "final") {
  const selected = new Map<string, Observation>();
  for (const row of rows) {
    const prior = selected.get(row.questionId);
    if (!prior || (which === "first" ? row.attempt < prior.attempt : row.attempt > prior.attempt)) selected.set(row.questionId, row);
  }
  return [...selected.values()];
}
