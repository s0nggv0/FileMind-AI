// Opt-in process preload for a release rehearsal. Counts every outbound attempt,
// including SDK retries, across child processes. Never records bodies or keys.
import { open, readFile, mkdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export function budgetedFetch(original, { directory, limit, hosts }) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 60) throw new Error("Invalid rehearsal request limit");
  const root = resolve(directory), ledger = join(root, "requests.jsonl"), lock = join(root, "requests.lock");
  async function reserve(host) {
    await mkdir(root, { recursive: true });
    let handle;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { handle = await open(lock, "wx"); break; }
      catch (error) { if (error.code !== "EEXIST") throw error; await new Promise(done => setTimeout(done, 25)); }
    }
    if (!handle) throw new Error("Live request ledger is locked; refusing an uncounted request");
    try {
      const prior = await readFile(ledger, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
      const entries = prior.trim() ? prior.trim().split("\n").map(line => JSON.parse(line)) : [];
      if (entries.length >= limit) throw new Error("Live rehearsal budget exhausted");
      const entry = { attempt: entries.length + 1, id: randomUUID(), at: new Date().toISOString(), host };
      const file = await open(ledger, "a");
      try { await file.writeFile(JSON.stringify(entry) + "\n"); await file.sync(); }
      finally { await file.close(); }
    } finally { await handle.close(); await unlink(lock); }
  }
  return async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return original(input, init);
    if (url.protocol !== "https:" || !hosts.includes(url.hostname)) throw new Error("Unapproved rehearsal network destination");
    await reserve(url.hostname);
    // Provider redirects would create an uncounted second request. Fail closed.
    return original(input, { ...init, redirect: "error" });
  };
}

if (process.env.FILEMIND_LIVE_BUDGET_ROOT) {
  globalThis.fetch = budgetedFetch(globalThis.fetch, {
    directory: process.env.FILEMIND_LIVE_BUDGET_ROOT,
    limit: Number(process.env.FILEMIND_LIVE_REQUEST_LIMIT),
    hosts: ["api.moonshot.cn", "api.moonshot.ai", "dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com"],
  });
}
