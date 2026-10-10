import { test, expect } from "@playwright/test";
import { readFile, rm, mkdir } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { Client } from "pg";
import { pdfFixture, docxFile } from "../e2e/fixtures";
test("personal search: real stored chunks, ask/find, source drawer, follow-up, fallback, refresh and mobile", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  let workspace: string | null = null; let user: string | undefined;
  // Token-hash mock vectors have no semantic ability. Exercise exact-term
  // evidence here; real semantic answering is verified by the frozen holdout.
  const exactQuery = '"Query Key Value"';
  try {
    await page.goto("/search"); await expect(page.getByRole("heading", { name: "向资料提问" })).toBeVisible();
    await expect(page.getByText("最近搜索", { exact: true })).toHaveCount(0);
    await page.goto("/workspace");
    await page.getByLabel("选择本地文件").setInputFiles([
      { name: "Transformer Notes.md", mimeType: "text/markdown", buffer: Buffer.from("# Transformer\n## Query Key Value\nSelf attention uses a Query to find a matching Key. A Value carries token content. Query and Key determine attention weights. BERT uses bidirectional Transformer attention. 自注意力通过 QKV 建模词元关系。") },
      { name: "database-indexes.txt", mimeType: "text/plain", buffer: Buffer.from("数据库索引优化减少回表。\nA covering index avoids table reads.\nA B-tree index reduces scanning.") },
      { name: "mapped-paper.pdf", mimeType: "application/pdf", buffer: pdfFixture() }, docxFile("paragraph-report.docx"),
    ]);
    await page.getByRole("button", { name: "开始整理" }).click();
    await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible({ timeout: 45000 });
    workspace = new URL(page.url()).searchParams.get("workspace");
    const snapshot = await (await context.request.get(`/api/workspaces/${workspace}`)).json();
    user = snapshot.documents[0].storagePath.split("/")[0];
    expect(snapshot.documents.find((d: { type: string }) => d.type === "pdf").metadata.structure.pages[0].page).toBe(1);
    expect(snapshot.documents.find((d: { type: string }) => d.type === "docx").metadata.structure.paragraphs[0].index).toBe(1);
    await page.getByRole("button", { name: "应用方案" }).click();
    await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible();
    await expect.poll(async () => (await (await context.request.get("/api/index")).json()).documents.filter((d: { status: string }) => d.status === "ready").length).toBe(4);
    await page.goto("/search"); await page.getByLabel("向资料提问", { exact: true }).fill(exactQuery);
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByRole("button", { name: "引用 1", exact: true })).toBeVisible();
    await expect(page.getByText("演示 / 模拟结果", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "引用 1", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible(); await expect(page.getByText("数据库原文", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").locator("mark")).toContainText("Query");
    await expect(page.getByRole("link", { name: "打开资料" })).toHaveAttribute("href", /document=/);
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.reload(); await expect(page.getByRole("button", { name: "引用 1", exact: true })).toBeVisible();
    await mkdir("artifacts", { recursive: true }); await page.screenshot({ path: "artifacts/rag-desktop.png", fullPage: true });
    await page.getByLabel("向资料提问", { exact: true }).fill("it / BERT?"); await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect.poll(async () => (await (await context.request.get("/api/search")).json()).recent[0]?.query).toBe("it / BERT?");
    const followupId = (await (await context.request.get("/api/search")).json()).recent[0].id;
    const followup = await (await context.request.get(`/api/search?runId=${followupId}`)).json();
    expect(followup.rewrittenQuery).toContain(`${exactQuery}\nFollow-up: it / BERT?`);
    await expect(page.getByRole("button", { name: "引用 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "查找资料", exact: true }).click(); await page.getByLabel("向资料提问", { exact: true }).fill("数据库索引优化"); await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByRole("heading", { name: "AI 回答" })).toHaveCount(0); await expect(page.getByRole("button", { name: /database-indexes.txt/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "问答", exact: true }).click(); await page.getByLabel("向资料提问", { exact: true }).fill("我的资料里量子纠缠有哪些解释？"); await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByText("我没有在你的资料中找到足够依据回答这个问题。", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: "artifacts/rag-mobile.png", fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const response = await context.request.post("/api/search", { headers: { origin: "http://127.0.0.1:3081" }, data: { query: exactQuery, mode: "ask" } });
    const events = (await response.text()).split("\n\n").filter(e => e.startsWith("data: ")).map(e => JSON.parse(e.slice(6)));
    const successful = events.find(e => e.type === "result").data;
    await page.route("**/api/search", async route => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "result", data: { ...successful, semanticUnavailable: true, answerUnavailable: true, answer: null } })}\n\n` });
    });
    await page.getByLabel("向资料提问", { exact: true }).fill(exactQuery); await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByText(/语义搜索暂时不可用/)).toBeVisible(); await expect(page.getByText(/AI 回答的生成或依据验证暂时不可用/)).toBeVisible();
    const outsider = await context.browser()!.newContext();
    try { expect((await outsider.request.get(`http://127.0.0.1:3081/api/search?chunkId=${successful.sources[0].id}`)).status()).toBe(404); }
    finally { await outsider.close(); }
    expect(errors).toEqual([]);
  } finally {
    if (workspace && user) {
      const instance = JSON.parse(await readFile(".filemind/postgresql/instance.json", "utf8")); const password = (await readFile(".filemind/postgresql/admin.password", "utf8")).trim();
      const client = new Client({ host: "127.0.0.1", port: instance.port, database: "filemind_ai", user: "filemind_admin", password });
      try { await client.connect(); await client.query("delete from filemind.retrieval_runs where user_id=$1", [user]); await client.query("delete from filemind.workspaces where id=$1 and user_id=$2", [workspace, user]); await client.query("delete from filemind.profiles where id=$1", [user]); }
      finally { await client.end(); }
      const root = resolve(".filemind/storage"); const directory = resolve(root, user, workspace); const rel = relative(root, directory);
      if (rel && !rel.startsWith("..") && !isAbsolute(rel)) await rm(directory, { recursive: true, force: true });
    }
  }
});
