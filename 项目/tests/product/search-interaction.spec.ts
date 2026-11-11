// UI lifecycle acceptance only. All responses are synthetic; no native API is used.
import { test, expect, type Page } from "@playwright/test";

function fixture(query = "合成保留期问题") {
  const documentId = crypto.randomUUID(), workspaceId = crypto.randomUUID();
  const source = { id: crypto.randomUUID(), documentId, sourceId: "S1", documentName: "合成范围资料.txt", content: "合成保留期为 6 小时。", location: "L2", fileType: "txt", summary: "合成摘要", tags: [] };
  return {
    id: crypto.randomUUID(), query, rewrittenQuery: query, mode: "ask", workspaceId, selectedDocumentIds: [documentId],
    sources: [source], nearest: [], issues: [], mock: true, candidateCount: 1, evidenceCount: 1, semanticUnavailable: false, answerUnavailable: false,
    answerState: "answered", verification: { status: "verified", version: "fixture" },
    answer: { answer: `${query}：6 小时。[S1]`, citations: [], confidence: "high", insufficientEvidence: false },
  };
}
const frame = (type: string, data: unknown) => `data: ${JSON.stringify({ type, data })}\n\n`;
const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ status: 501, json: { error: "Unmocked synthetic request" } }));
  await page.route("**/api/index*", route => route.fulfill({ json: { documents: [], mock: true } }));
  // Simulate a transport that does not cooperate with abort. The client and
  // interaction owner must still reject any late response.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (url, options) => original(url, String(url).startsWith("/api/search") ? { ...options, signal: undefined } : options);
  });
});

test("a late initial history response cannot replace a newer search or its scope and URL", async ({ page }) => {
  const old = fixture("迟到的历史问题"), current = fixture("当前合成问题");
  let release: (() => void) | undefined, delivered = false;
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/search*", async route => {
    if (route.request().method() === "GET") {
      if (!new URL(route.request().url()).searchParams.has("runId")) return route.fulfill({ json: { recent: [] } });
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ json: old }); delivered = true; return;
    }
    posts.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "text/event-stream", body: frame("result", current) });
  });
  await page.goto(`/search?run=${old.id}&workspace=${current.workspaceId}&documents=${current.selectedDocumentIds}`);
  await expect.poll(() => !!release).toBe(true);
  await page.getByLabel("向资料提问", { exact: true }).fill(current.query);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/search\\?run=${current.id}$`));
  release!(); await expect.poll(() => delivered).toBe(true); await settle(page);
  await expect(page.getByLabel("向资料提问", { exact: true })).toHaveValue(current.query);
  await expect(page).toHaveURL(new RegExp(`/search\\?run=${current.id}$`));
  expect(posts).toEqual([{ query: current.query, mode: "ask", workspaceId: current.workspaceId, documentIds: current.selectedDocumentIds }]);
  await expect(page.getByText(old.query, { exact: false })).toHaveCount(0);
});

for (const late of ["result", "error"] as const) test(`cancel and consecutive submissions reject a late ${late} without clearing the active stage`, async ({ page }) => {
  const saved = fixture("已保存成功问题"), current = { ...saved, id: crypto.randomUUID(), query: "取消后的新问题" };
  const releases: (() => void)[] = [], posts: Record<string, unknown>[] = [];
  let oldDelivered = false;
  await page.route("**/api/search*", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: new URL(route.request().url()).searchParams.has("runId") ? saved : { recent: [] } });
    const index = posts.length; posts.push(route.request().postDataJSON());
    await new Promise<void>(resolve => { releases[index] = resolve; });
    await route.fulfill({ contentType: "text/event-stream", body: index === 0 ? frame(late, late === "result" ? { ...saved, id: crypto.randomUUID(), query: "过期结果" } : { reason: "VERIFICATION_FAILED" }) : frame("result", current) });
    if (index === 0) oldDelivered = true;
  });
  await page.goto(`/search?run=${saved.id}`);
  await expect(page.getByRole("button", { name: "引用 1", exact: true })).toBeVisible();
  await page.locator("form").evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect.poll(() => posts.length).toBe(1);
  await page.getByRole("button", { name: "取消搜索", exact: true }).click();
  await expect(page.getByRole("button", { name: "引用 1", exact: true })).toBeVisible();
  await page.getByLabel("向资料提问", { exact: true }).fill(current.query);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect.poll(() => releases.length).toBe(2);
  releases[0](); await expect.poll(() => oldDelivered).toBe(true); await settle(page);
  await expect(page.getByRole("button", { name: "取消搜索", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "搜索中", exact: true })).toBeDisabled();
  await expect(page.getByText("过期结果", { exact: false })).toHaveCount(0);
  releases[1]();
  await expect(page).toHaveURL(new RegExp(`/search\\?run=${current.id}$`));
  await expect(page.getByRole("button", { name: "搜索", exact: true })).toBeEnabled();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toMatchObject({ query: current.query, workspaceId: saved.workspaceId, documentIds: saved.selectedDocumentIds, previousRunId: saved.id });
});

test("recent history restores its own workspace, documents and mode before retry", async ({ page }) => {
  const saved = { ...fixture(), mode: "find", answer: null }, initial = fixture("初始范围");
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/search*", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: new URL(route.request().url()).searchParams.has("runId") ? saved : { recent: [saved] } });
    posts.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "text/event-stream", body: frame("result", { ...saved, id: crypto.randomUUID() }) });
  });
  await page.goto(`/search?workspace=${initial.workspaceId}&document=${initial.selectedDocumentIds[0]}`);
  await page.getByRole("button", { name: saved.query, exact: true }).click();
  await expect(page.getByRole("button", { name: "查找资料", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(new RegExp(`/search\\?run=${saved.id}$`));
  await page.getByRole("button", { name: "重新搜索", exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ query: saved.query, mode: "find", workspaceId: saved.workspaceId, documentIds: saved.selectedDocumentIds, previousRunId: saved.id });
});

for (const width of [390, 1440]) test(`citations preserve full-text, close and library return focus at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const saved = fixture(), source = saved.sources[0], text = `前文。${source.content}后文。`;
  const pageErrors: string[] = []; page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/api/documents/*", route => route.fulfill({ json: { id: source.documentId, name: source.documentName, fileType: "txt", text, fileSize: text.length, metadata: {}, summary: "合成摘要", tags: [], relations: 0, storageStatus: "available", updatedAt: "2026-01-01", parseStatus: "completed", indexStatus: "ready" } }));
  await page.route("**/api/search*", route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: params.has("chunkId") ? { ...source, citation: { status: "located", label: "L2", range: { start: 3, end: 3 + source.content.length }, before: "前文。", after: "后文。", pdfPage: null, textVersion: "a".repeat(64), ...(params.get("view") === "full" ? { text } : {}) } } : params.has("runId") ? saved : { recent: [] } });
  });
  await page.goto(`/search?run=${saved.id}`);
  const citation = page.getByRole("button", { name: "引用 1", exact: true });
  await citation.focus(); await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog");
  await expect(dialog.locator("mark")).toHaveText(source.content);
  await dialog.getByRole("button", { name: "打开全文并定位", exact: true }).click();
  await expect(dialog.getByLabel("引用对应的原文", { exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "返回引用片段", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "打开全文并定位", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(citation).toBeFocused();
  await citation.click(); await page.getByRole("dialog").getByRole("link", { name: "打开资料", exact: true }).click();
  await expect(page).toHaveURL(/\/library\?/);
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("引用对应的原文", { exact: true })).toHaveText(source.content);
  await dialog.getByRole("link", { name: "返回原搜索结果", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/search\\?run=${saved.id}&focusChunk=${source.id}$`));
  await expect(citation).toBeFocused();
  await citation.click(); await page.getByRole("dialog").getByRole("button", { name: "返回搜索结果", exact: true }).click();
  await expect(citation).toBeFocused();
  expect(pageErrors).toEqual([]);
});
