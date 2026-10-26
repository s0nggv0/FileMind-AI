// Transport fixtures cover UI behavior; search-service and native API tests
// independently exercise the actual outcome decisions and identity boundary.
import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { readiness } from "../../src/lib/retrieval/readiness";
import { searchIssueCopy, type SearchIssue } from "../../src/lib/retrieval/search-outcome";

for (const width of [390, 1440]) {
  test(`all search outcomes and explicit recovery preserve scope at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const workspaceId = crypto.randomUUID(), documentId = crypto.randomUUID(), readyId = crypto.randomUUID();
    const source = { id: crypto.randomUUID(), documentId, sourceId: "S1", documentName: "合成资料.txt", content: "合成原文中的保留期是 6 小时。", location: "L1", fileType: "txt", summary: "", tags: [] };
    const documents = [
      { id: documentId, workspaceId, name: source.documentName, status: "ready", chunks: 1 },
      { id: readyId, workspaceId, name: "已完成.txt", status: "ready", chunks: 1 },
    ];
    const documentIds = documents.map(d => d.id);
    let reason: SearchIssue = "PREPARATION_INCOMPLETE", legacy = false;
    let releaseSearch: (() => void) | undefined, releasePreparation: (() => void) | undefined;
    const posts: Record<string, unknown>[] = [], preparations: Record<string, unknown>[] = [], errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const result = () => ({
      id: crypto.randomUUID(), query: "保留期是多少？", rewrittenQuery: "保留期是多少？", workspaceId, selectedDocumentIds: documentIds,
      mode: "ask", sources: reason === "NO_RELEVANT_CONTENT" ? [] : [source], nearest: [source],
      evidenceCount: 1, candidateCount: 1, mock: true, semanticUnavailable: reason === "SEMANTIC_UNAVAILABLE", answerUnavailable: false,
      ...(legacy ? {} : { issues: [reason], verification: { status: reason === "VERIFICATION_FAILED" ? "rejected" : "no_answer", version: "fixture" } }),
      answer: { answer: "UNVERIFIED DRAFT MUST STAY HIDDEN", citations: [], confidence: "low", insufficientEvidence: true },
    });
    await page.route("**/api/index*", async route => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON(); preparations.push(body);
        await new Promise<void>(resolve => { releasePreparation = resolve; });
        documents[0].status = "ready"; documents[0].chunks = 1;
        return route.fulfill({ json: { results: [{ documentId, status: "ready", chunks: 1 }] } });
      }
      const params = new URL(route.request().url()).searchParams;
      expect(params.get("workspaceId")).toBe(workspaceId);
      expect(params.get("documentIds")?.split(",").sort()).toEqual([...documentIds].sort());
      await route.fulfill({ json: { documents, summary: readiness(documents), nextCursor: null } });
    });
    await page.route("**/api/search*", async route => {
      const url = new URL(route.request().url());
      if (route.request().method() === "GET") {
        if (url.searchParams.has("chunkId") && reason === "SOURCES_CHANGED") return route.fulfill({ status: 404, json: { reason, error: "PRIVATE SOURCE STACK" } });
        return route.fulfill({ json: url.searchParams.has("runId") ? result() : url.searchParams.has("chunkId") ? source : { recent: [] } });
      }
      posts.push(route.request().postDataJSON());
      await new Promise<void>(resolve => { releaseSearch = resolve; });
      await route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "draft", data: "PRIVATE DRAFT" })}\n\ndata: ${JSON.stringify({ type: "result", data: result() })}\n\n` });
    });
    await mkdir("artifacts/search-recovery", { recursive: true });
    for (const code of ["PREPARATION_INCOMPLETE", "NO_RELEVANT_CONTENT", "MISSING_REQUESTED_FACTS", "VERIFICATION_FAILED", "ANSWER_SERVICE_UNAVAILABLE", "SOURCES_CHANGED", "SEMANTIC_UNAVAILABLE", "INSUFFICIENT_EVIDENCE", "HISTORY_UNVERIFIED"] as SearchIssue[]) {
      reason = code; legacy = code === "HISTORY_UNVERIFIED";
      documents[0].status = code === "PREPARATION_INCOMPLETE" ? "not_indexed" : "ready";
      documents[0].chunks = code === "PREPARATION_INCOMPLETE" ? 0 : 1;
      await page.goto(`/search?workspace=${workspaceId}&documents=${documentIds.join(",")}&run=${crypto.randomUUID()}`);
      const panel = page.getByRole("region", { name: "搜索说明与恢复操作" });
      await expect(panel.getByRole("heading", { name: searchIssueCopy[code].title, exact: true })).toBeVisible();
      await expect(page.getByText("UNVERIFIED DRAFT MUST STAY HIDDEN")).toHaveCount(0);
      const count = posts.length;
      await expect(page.getByText(/当前范围：选定 2 份资料/)).toBeVisible();
      expect(posts.length).toBe(count);
      if (searchIssueCopy[code].actions.includes("edit")) {
        await panel.getByRole("button", { name: "调整问题", exact: true }).click();
        await expect(page.getByLabel("向资料提问", { exact: true })).toBeFocused();
      }
      if (searchIssueCopy[code].actions.includes("sources")) {
        await panel.getByRole("button", { name: "查看相关原文", exact: true }).click();
        await expect(page.locator("#search-passages")).toBeFocused();
        await page.locator("#search-passages").getByRole("button", { name: /合成资料.txt/ }).click();
        if (code === "SOURCES_CHANGED") {
          await expect(page.getByRole("dialog").getByText(/来源已经变化或失效。已保存的片段仍保留/)).toBeVisible();
          await expect(page.getByText("PRIVATE SOURCE STACK")).toHaveCount(0);
          await page.getByRole("button", { name: "重试加载来源", exact: true }).click();
        } else await expect(page.getByRole("dialog").locator("mark")).toHaveText(source.content);
        await page.keyboard.press("Escape");
      }
      if (code === "PREPARATION_INCOMPLETE") {
        await panel.getByRole("button", { name: "准备未完成资料", exact: true }).click();
        await expect(panel.getByRole("button", { name: "正在准备未完成资料…", exact: true })).toBeDisabled();
        await expect.poll(() => preparations.length).toBe(1);
        expect(preparations[0]).toEqual({ documentId, workspaceId, unfinishedOnly: true });
        expect(posts.length).toBe(count);
        releasePreparation!();
        await expect(page.getByText(/本次已准备 1 份资料/)).toBeVisible();
        expect(posts.length).toBe(count); // Preparation never automatically asks the model.
      }
      if (searchIssueCopy[code].actions.includes("retry")) {
        await panel.getByRole("button", { name: "在当前范围重试", exact: true }).click();
        await expect.poll(() => posts.length).toBe(count + 1);
        await expect(panel.getByRole("button", { name: "在当前范围重试", exact: true })).toBeDisabled();
        await expect(page.getByText("正在检查原文依据，完成后显示回答。")).toBeVisible();
        if (code === "VERIFICATION_FAILED") await page.screenshot({ path: `artifacts/search-recovery/loading-${width}.png`, fullPage: true });
        expect(posts.at(-1)).toMatchObject({ workspaceId, documentIds, mode: "ask", query: "保留期是多少？" });
        releaseSearch!();
        await expect(page.getByRole("button", { name: "搜索", exact: true })).toBeEnabled();
        expect(posts.length).toBe(count + 1);
        await expect(page.getByText("PRIVATE DRAFT")).toHaveCount(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (["VERIFICATION_FAILED", "PREPARATION_INCOMPLETE", "SOURCES_CHANGED"].includes(code)) {
        await page.evaluate(() => { window.scrollTo(0, 0); });
        await page.screenshot({ path: `artifacts/search-recovery/${code}-${width}.png`, fullPage: true });
      }
    }
    expect(errors).toEqual([]);
  });

  test(`failed and cancelled retries retain a successful answer at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const workspaceId = crypto.randomUUID(), documentId = crypto.randomUUID();
    const source = { id: crypto.randomUUID(), documentId, sourceId: "S1", documentName: "已验证资料.txt", content: "保留期 6 小时。", location: "L1", fileType: "txt", tags: [] };
    const saved = { id: crypto.randomUUID(), query: "保留期？", mode: "ask", workspaceId, selectedDocumentIds: [documentId], sources: [source], nearest: [], issues: [], answerState: "answered", answerUnavailable: false, verification: { status: "verified", version: "fixture" }, answer: { answer: "保留期 6 小时。[S1]", citations: [], insufficientEvidence: false, confidence: "high" } };
    let posts = 0, release: (() => void) | undefined;
    await page.route("**/api/index*", route => route.fulfill({ json: { documents: [] } }));
    await page.route("**/api/search*", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: new URL(route.request().url()).searchParams.has("runId") ? saved : { recent: [] } });
      posts++;
      expect(route.request().postDataJSON()).toMatchObject({ workspaceId, documentIds: [documentId] });
      if (posts === 1) return route.fulfill({ status: 503, json: { error: "PRIVATE STACK AND CREDENTIAL", reason: "UNKNOWN_FUTURE_CODE" } });
      if (posts === 2) return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "error", data: "PRIVATE STACK AND CREDENTIAL" })}\n\n` });
      if (posts === 3) { await new Promise<void>(resolve => { release = resolve; }); return route.abort().catch(() => {}); }
      return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "result", data: { ...saved, id: crypto.randomUUID(), issues: ["VERIFICATION_FAILED"], verification: { status: "rejected", version: "fixture" }, answer: null } })}\n\n` });
    });
    await page.goto(`/search?run=${saved.id}`);
    await expect(page.getByRole("button", { name: "引用 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "重新搜索并生成回答", exact: true }).click();
    for (let i = 1; i <= 2; i++) {
      await expect(page.getByRole("heading", { name: "本次搜索未完成", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "引用 1", exact: true })).toBeVisible();
      await expect(page.getByText("PRIVATE STACK AND CREDENTIAL")).toHaveCount(0);
      expect(posts).toBe(i);
      await page.getByRole("button", { name: "在当前范围重试", exact: true }).click();
    }
    await expect.poll(() => posts).toBe(3);
    await page.getByRole("button", { name: "取消搜索", exact: true }).click(); release!();
    await expect(page.getByText("搜索已取消，可以重试。", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "引用 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "重新搜索并生成回答", exact: true }).click();
    await expect(page.getByRole("heading", { name: "上次已通过验证的结果", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "生成回答未通过事实验证", exact: true })).toBeVisible();
    expect(posts).toBe(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`an empty lookup retains previously found passages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const workspaceId = crypto.randomUUID(), documentId = crypto.randomUUID();
    const source = { id: crypto.randomUUID(), documentId, sourceId: "S1", documentName: "保留的资料片段.txt", content: "先前找到的保留期为 6 小时。", location: "L1", fileType: "txt", tags: [] };
    const saved = { id: crypto.randomUUID(), query: "保留期", mode: "find", workspaceId, selectedDocumentIds: [documentId], sources: [source], nearest: [], issues: [], answer: null };
    await page.route("**/api/index*", route => route.fulfill({ json: { documents: [] } }));
    await page.route("**/api/search*", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: new URL(route.request().url()).searchParams.has("runId") ? saved : { recent: [] } });
      expect(route.request().postDataJSON()).toMatchObject({ workspaceId, documentIds: [documentId], mode: "find" });
      await route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "result", data: { ...saved, id: crypto.randomUUID(), sources: [], issues: ["NO_RELEVANT_CONTENT"] } })}\n\n` });
    });
    await page.goto(`/search?run=${saved.id}`);
    await page.getByRole("button", { name: "重新搜索", exact: true }).click();
    await expect(page.getByRole("heading", { name: "上次找到的资料片段", exact: true })).toBeVisible();
    await expect(page.getByText(source.content, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "没有召回足够相关的内容", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
