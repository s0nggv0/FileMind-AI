import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rm } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { Client } from "pg";
test("real DashScope + Kimi: verified final answer, citation DB content, refresh and no-answer", async ({ page, context }) => {
  const origin = process.env.FILEMIND_TEST_ORIGIN!; const headers = { origin };
  const testRoot = resolve(process.env.FILEMIND_TEST_ROOT!);
  const testRelative = relative(resolve("artifacts"), testRoot);
  expect(testRelative).toMatch(/^phase8-fresh-[\w-]+$/);
  expect(isAbsolute(testRelative)).toBe(false);
  const config = await (await context.request.get("/api/workspace-config")).json(); expect(config).toMatchObject({ persistent: true, intelligence: true });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await original(...args);
      if (String(args[0]).endsWith("/api/search") && args[1]?.method === "POST") (window as unknown as { ragStream: Promise<string> }).ragStream = response.clone().text();
      return response;
    };
  });
  let workspace: string | undefined; let user: string | undefined;
  const report = { REAL_RAG_BROWSER_VERIFIED: false, noUnverifiedDraft: false, factVerificationPassed: false, databaseOriginalMatched: false, refreshPassed: false, noAnswerPassed: false, checkedAt: new Date().toISOString() };
  try {
    const created = await context.request.post("/api/workspaces", { headers, data: { name: "Synthetic live RAG browser verification" } }); expect(created.ok()).toBe(true);
    const snapshot = await created.json(); workspace = snapshot.id;
    const id = randomUUID(); const bytes = Buffer.from("# Transformer\n## Query Key Value\nA Query describes which information a token needs. A Key describes the information available in a token. Query and Key dot products determine attention weights. A Value carries the token content aggregated by these weights. BERT uses bidirectional Transformer attention. 自注意力使用 Query、Key、Value 建模词元关系。");
    const document = { id, name: "live-transformer.md", type: "md", mimeType: "text/markdown", size: bytes.length, parseStatus: "completed", contentHash: createHash("sha256").update(bytes).digest("hex"), metadata: { addedAt: new Date().toISOString() } };
    expect((await context.request.put(`/api/workspaces/${workspace}`, { headers, data: { ...snapshot, documents: [document], texts: { [id]: bytes.toString() } } })).ok()).toBe(true);
    const upload = await context.request.post(`/api/workspaces/${workspace}/files`, { headers, multipart: { documentId: id, file: { name: document.name, mimeType: document.mimeType, buffer: bytes } } }); expect(upload.ok()).toBe(true);
    user = (await upload.json()).documents[0].storagePath.split("/")[0];
    const indexed = await context.request.post("/api/index", { headers, data: { workspaceId: workspace } }); expect(indexed.ok()).toBe(true); expect((await indexed.json()).results[0].status).toBe("ready");
    await page.goto("/search"); await expect(page.getByText("Demo / Mock", { exact: true })).toHaveCount(0);
    await page.getByLabel("Ask your knowledge", { exact: true }).fill("简短解释 Query、Key、Value 的作用，并引用我的资料。"); await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByRole("button", { name: "Citation 1", exact: true }).first()).toBeVisible({ timeout: 180000 });
    const events = (await page.evaluate(() => (window as unknown as { ragStream: Promise<string> }).ragStream)).split("\n\n").filter(e => e.startsWith("data: ")).map(e => JSON.parse(e.slice(6))); const result = events.find(e => e.type === "result").data;
    expect(result.mock).toBe(false); expect(result.answerUnavailable).toBe(false); expect(result.answer.citations.length).toBeGreaterThan(0); report.noUnverifiedDraft = !events.some(e => e.type === "draft"); expect(report.noUnverifiedDraft).toBe(true); expect(result.verification.status).toBe("verified"); report.factVerificationPassed = true;
    await page.getByRole("button", { name: "Citation 1", exact: true }).first().click();
    const source = await (await context.request.get(`/api/search?chunkId=${result.answer.citations[0].chunkId}`)).json();
    await expect(page.getByRole("dialog").locator("mark")).toHaveText(source.content); expect(bytes.toString()).toContain(source.content); report.databaseOriginalMatched = true;
    await page.getByRole("button", { name: "关闭", exact: true }).click(); await page.reload(); await expect(page.getByRole("button", { name: "Citation 1", exact: true }).first()).toBeVisible(); report.refreshPassed = true;
    await page.getByLabel("Ask your knowledge", { exact: true }).fill("我的资料里量子纠缠有哪些解释？"); await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByText("我没有在你的资料中找到足够依据回答这个问题。", { exact: true })).toBeVisible({ timeout: 60000 }); report.noAnswerPassed = true;
    expect(errors).toEqual([]); report.REAL_RAG_BROWSER_VERIFIED = true;
  } finally {
    await writeFile("docs/evaluation/phase8-rag-live-browser.json", JSON.stringify(report, null, 2) + "\n");
    if (workspace && user) {
      const instance = JSON.parse(await readFile(resolve(testRoot, ".filemind/postgresql/instance.json"), "utf8")); const password = (await readFile(resolve(testRoot, ".filemind/postgresql/admin.password"), "utf8")).trim();
      const client = new Client({ host: "127.0.0.1", port: instance.port, database: "filemind_ai", user: "filemind_admin", password });
      try { await client.connect(); await client.query("delete from filemind.retrieval_runs where user_id=$1", [user]); await client.query("delete from filemind.workspaces where id=$1 and user_id=$2", [workspace, user]); await client.query("delete from filemind.profiles where id=$1", [user]); } finally { await client.end(); }
      const root = resolve(testRoot, ".filemind/storage"); const directory = resolve(root, user, workspace); const rel = relative(root, directory); if (rel && !rel.startsWith("..") && !isAbsolute(rel)) await rm(directory, { recursive: true, force: true });
    }
  }
});
