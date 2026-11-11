import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { Client } from "pg";
test("real multimodal: upload, Vision review, apply, image search, grounded citation, original, refresh and mobile", async ({ page, context }) => {
  const report = { REAL_MULTIMODAL_E2E_VERIFIED: false, checkedAt: new Date().toISOString(), transformer: false, whiteboard: false, originalBytesMatched: false, imageUserIsolation: false, refresh: false, mobile: false, injection: false, crossModal: false, visionCache: false, citationRetryUi: false, visionFailureUi: false, failureUiMode: "injected API response; real pipeline failure is unit tested" };
  let workspace: string | undefined; let user: string | undefined;
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto("/workspace");
    const payloads = await Promise.all(["transformer-slide.png", "linear-algebra-board.jpg", "security-scan.png"].map(async name => ({ name, mimeType: name.endsWith("jpg") ? "image/jpeg" : "image/png", buffer: await readFile(`tests/fixtures/rag-hard/images/${name}`) })));
    await page.getByLabel("选择本地文件").setInputFiles([...payloads, { name: "Transformer Notes.txt", mimeType: "text/plain", buffer: Buffer.from("Transformer notes. Self Attention processes token relationships. The Encoder and Decoder are components of a Transformer model. See the accompanying slide for projection roles.") }]);
    await page.getByRole("button", { name: "开始整理" }).click();
    await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible({ timeout: 180000 });
    workspace = new URL(page.url()).searchParams.get("workspace")!;
    const snapshot = await (await context.request.get(`/api/workspaces/${workspace}`)).json();
    expect(snapshot.run.simulation).toBe(false); expect(snapshot.run.visionUsage.requests).toBe(3);
    expect(snapshot.run.steps.some((s: { tool: string }) => s.tool === "analyze_image")).toBe(true);
    const transformer = snapshot.documents.find((d: { name: string }) => d.name === "transformer-slide.png");
    const board = snapshot.documents.find((d: { name: string }) => d.name === "linear-algebra-board.jpg");
    const injection = snapshot.documents.find((d: { name: string }) => d.name === "security-scan.png");
    user = transformer.storagePath.split("/")[0];
    expect(snapshot.texts[transformer.id]).toContain("Self Attention");
    const analysis = await (await context.request.get(`/api/images/${transformer.id}`)).json();
    expect(analysis.analysis.visionStatus).toBe("ready"); expect(analysis.analysis.ocrStatus).toBe("ready"); expect(JSON.stringify(analysis.analysis.vision)).toMatch(/attention|transformer/i);
    const boardDetail = await (await context.request.get(`/api/images/${board.id}`)).json(); expect(boardDetail.analysis.visionStatus).toBe("ready"); expect(JSON.stringify(boardDetail.analysis.vision)).toMatch(/eigen|特征|linear/i);
    const attacked = await (await context.request.get(`/api/images/${injection.id}`)).json(); expect(attacked.analysis.ocr.text).toMatch(/Ignore previous instructions/i); expect(JSON.stringify(attacked.analysis.vision)).not.toContain(process.env.KIMI_API_KEY ?? "not-a-secret");
    expect(snapshot.documents).toHaveLength(4); expect(snapshot.run.steps.every((s: { tool: string }) => !/delete|shell|network/.test(s.tool))).toBe(true); report.injection = true;
    const outsider = await context.browser()!.newContext();
    try { expect((await outsider.request.get(`http://127.0.0.1:3082/api/images/${transformer.id}?original=1`)).status()).toBe(404); }
    finally { await outsider.close(); } report.imageUserIsolation = true;
    await page.getByRole("button", { name: "应用方案" }).click();
    await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible();
    await expect.poll(async () => (await (await context.request.get("/api/index")).json()).documents.filter((d: { id: string; status: string }) => [transformer.id, board.id, injection.id].includes(d.id) && d.status === "ready").length, { timeout: 90000 }).toBe(3);
    const reindex = await context.request.post("/api/index", { headers: { origin: "http://127.0.0.1:3082" }, data: { documentId: transformer.id } }); expect(reindex.ok()).toBe(true);
    const cached = await (await context.request.get(`/api/images/${transformer.id}`)).json(); expect(cached.analysis.usage.requests).toBe(0); report.visionCache = true;
    expect(cached.related.some((d: { name: string }) => d.name === "Transformer Notes.txt")).toBe(true);
    const found = await context.request.post("/api/search", { headers: { origin: "http://127.0.0.1:3082" }, data: { query: "Transformer Self Attention Encoder", mode: "find", workspaceId: workspace } });
    const events = (await found.text()).split("\n\n").filter(e => e.startsWith("data: ")).map(e => JSON.parse(e.slice(6))); const names = events.find(e => e.type === "result").data.sources.map((s: { documentName: string }) => s.documentName);
    expect(names).toContain("Transformer Notes.txt"); expect(names).toContain("transformer-slide.png"); report.crossModal = true;
    await page.goto("/library?source=workspace");
    await page.getByRole("button", { name: /transformer-slide.png/ }).click();
    await expect(page.getByRole("dialog").getByRole("img", { name: /原图/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "提取文字 · OCR", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI 解读", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.goto("/search");
    await page.getByLabel("向资料提问", { exact: true }).fill("我的 Transformer 截图中 Self Attention 的 Query、Key、Value 分别有什么作用？只根据截图回答。");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByRole("button", { name: "引用 1", exact: true }).first()).toBeVisible({ timeout: 90000 });
    const run = await (await context.request.get(`/api/search?runId=${new URL(page.url()).searchParams.get("run")}`)).json();
    const imageCitation = run.answer.citations.find((c: { chunkId: string }) => run.sources.some((s: { id: string; documentName: string }) => s.id === c.chunkId && s.documentName === "transformer-slide.png")); expect(imageCitation).toBeTruthy();
    let failPreview = true;
    await page.route(`**/api/search?chunkId=${imageCitation.chunkId}`, async route => { if (failPreview) { failPreview = false; await route.fulfill({ status: 503, json: { error: "Synthetic source outage" } }); } else await route.continue(); });
    await page.getByRole("button", { name: `引用 ${imageCitation.sourceId.slice(1)}`, exact: true }).first().click();
    await expect(page.getByRole("alert").filter({ hasText: "Synthetic source outage" })).toBeVisible();
    await page.getByRole("button", { name: "重试加载来源", exact: true }).click(); report.citationRetryUi = true;
    await expect(page.getByRole("dialog").getByRole("img", { name: /原图： transformer-slide.png/ })).toBeVisible();
    const original = await context.request.get(`/api/images/${transformer.id}?original=1`); expect((await original.body()).equals(await readFile("tests/fixtures/rag-hard/images/transformer-slide.png"))).toBe(true); report.originalBytesMatched = true; report.transformer = true;
    await expect(page.getByRole("dialog").locator("mark")).not.toContainText(/P\d+|L\d+/); await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.reload(); await expect(page.getByRole("button", { name: "引用 1", exact: true }).first()).toBeVisible(); report.refresh = true;
    await page.getByLabel("向资料提问", { exact: true }).fill("我的课堂板书里关于特征值 Av = λv 说了什么？"); await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByRole("button", { name: /linear-algebra-board.jpg/ }).first()).toBeVisible({ timeout: 90000 }); report.whiteboard = true;
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: /linear-algebra-board.jpg/ }).first().click(); await expect(page.getByRole("dialog").getByRole("img", { name: /原图： linear-algebra-board.jpg/ })).toBeVisible();
    await expect.poll(() => page.getByRole("dialog").getByRole("img", { name: /原图/ }).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await mkdir("artifacts", { recursive: true }); await page.screenshot({ path: "artifacts/multimodal-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 }); await expect(page.getByRole("dialog").getByRole("img", { name: /原图/ })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: "artifacts/multimodal-mobile.png" }); report.mobile = true;
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.route(`**/api/images/${board.id}`, route => route.fulfill({ json: { ...boardDetail, analysis: { ...boardDetail.analysis, vision: null, visionStatus: "failed" } } }));
    await page.getByRole("button", { name: /linear-algebra-board.jpg/ }).first().click();
    await expect(page.getByText("Visual understanding unavailable. Text extraction succeeded.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "提取文字 · OCR", exact: true })).toBeVisible(); report.visionFailureUi = true;
    expect(errors).toEqual([]); report.REAL_MULTIMODAL_E2E_VERIFIED = true;
  } finally {
    await writeFile("docs/phase-checklists/multimodal-live-browser.json", JSON.stringify(report, null, 2) + "\n");
    if (workspace && user) {
      const instance = JSON.parse(await readFile(".filemind/postgresql/instance.json", "utf8")); const password = (await readFile(".filemind/postgresql/admin.password", "utf8")).trim();
      const client = new Client({ host: "127.0.0.1", port: instance.port, database: "filemind_ai", user: "filemind_admin", password });
      try { await client.connect(); await client.query("delete from filemind.retrieval_runs where user_id=$1", [user]); await client.query("delete from filemind.workspaces where id=$1 and user_id=$2", [workspace, user]); await client.query("delete from filemind.profiles where id=$1", [user]); } finally { await client.end(); }
      const root = resolve(".filemind/storage"); const target = resolve(root, user, workspace); const rel = relative(root, target); if (rel && !rel.startsWith("..") && !isAbsolute(rel)) await rm(target, { recursive: true, force: true });
    }
  }
});
