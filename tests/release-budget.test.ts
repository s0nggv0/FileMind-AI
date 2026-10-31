import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error Runtime preload deliberately remains standalone JavaScript.
import { budgetedFetch } from "../scripts/verification/live-request-budget.mjs";

test("rehearsal budget persists failures and prevents concurrent overrun without storing secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "filemind-budget-"));
  let called = 0;
  const transport = async (_input: unknown, options: RequestInit) => { called++; assert.equal(options.redirect, "error"); throw new Error("offline"); };
  try {
    const options = { directory, limit: 3, hosts: ["api.moonshot.cn"] };
    const first = budgetedFetch(transport, options), second = budgetedFetch(transport, options);
    await Promise.allSettled(Array.from({ length: 8 }, (_, i) => (i % 2 ? first : second)("https://api.moonshot.cn/v1/chat/completions", { headers: { authorization: "secret-do-not-store" }, body: "private-text" })));
    assert.equal(called, 3);
    const lines = await readFile(join(directory, "requests.jsonl"), "utf8");
    assert.equal(lines.trim().split("\n").length, 3);
    assert.ok(!/secret-do-not-store|private-text|authorization/.test(lines));
    await assert.rejects(budgetedFetch(transport, options)("https://api.moonshot.cn/v1/chat/completions"), /exhausted/);
    await assert.rejects(first("https://example.com"), /Unapproved/);
    assert.equal(called, 3);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
