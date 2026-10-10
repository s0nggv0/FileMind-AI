import { test, expect, type Page } from "@playwright/test";
import { recoverSnapshot, WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "../../src/lib/workspace/schemas";
import { validateReview } from "../../src/lib/workspace/authorization";
import { textFile } from "./fixtures";
async function persistentTransport(page: Page, existing?: WorkspaceSnapshot, intelligence = false) {
  let snapshot = existing; let saves = 0;
  await page.route("**/api/workspace-config", route => route.fulfill({ json: { persistent: true, intelligence, label: intelligence ? "FileMind Intelligence" : "模拟 · 本地规则整理" } }));
  await page.route("**/api/workspaces**", async route => {
    const request = route.request(); const method = request.method(); const url = new URL(request.url());
    if (method === "GET") { await route.fulfill({ json: snapshot ? recoverSnapshot(snapshot) : { workspaces: [], persistent: true } }); return; }
    if (url.pathname.endsWith("/files")) { await route.fulfill({ json: snapshot }); return; }
    if (method === "POST") {
      snapshot = WorkspaceSnapshotSchema.parse({ id: crypto.randomUUID(), name: "Transformer 笔记", revision: 0, documents: [], run: null, proposal: null, texts: {}, updatedAt: new Date().toISOString() });
    } else if (method === "PUT") {
      const next = WorkspaceSnapshotSchema.parse(request.postDataJSON()); expect(next.revision).toBe(snapshot?.revision); snapshot = { ...next, revision: next.revision + 1 }; saves++;
    } else if (method === "PATCH") {
      const body = request.postDataJSON(); expect(body.revision).toBe(snapshot?.revision);
      if (body.action === "resume") { snapshot!.run = null; snapshot!.proposal = null; }
      else { validateReview(snapshot!, body.proposal); snapshot!.proposal = body.proposal; if (body.action === "apply") { snapshot!.run!.status = "completed"; snapshot!.run!.result = body.proposal; } }
      snapshot!.revision++; saves++;
    }
    await route.fulfill({ json: snapshot });
  });
  return { snapshot: () => snapshot!, saves: () => saves };
}
test("persistent mock upload → review autosave → refresh review → apply → refresh completed", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const transport = await persistentTransport(page);
  await page.goto("/workspace"); await expect(page.getByText("可保存工作区", { exact: false }).first()).toBeVisible();
  await page.getByLabel("选择本地文件").setInputFiles([textFile("Transformer Notes.txt")]);
  await page.getByRole("button", { name: "开始整理" }).click(); await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible();
  // Wait for run events to finish saving before review edits.
  await expect.poll(() => transport.snapshot()?.run?.status).toBe("waiting_for_review");
  await page.getByLabel("文件分类： Transformer Notes.txt").selectOption("Research");
  await page.getByLabel("新标签： Transformer Notes.txt").fill("Custom"); await page.getByRole("button", { name: "添加标签： Transformer Notes.txt" }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  expect(transport.snapshot().proposal!.documents[0].tags).toContain("Custom");
  await page.reload(); await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible(); await expect(page.getByLabel("文件分类： Transformer Notes.txt")).toHaveValue("Research");
  await page.getByRole("button", { name: "应用方案" }).click(); await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible();
  expect(transport.saves()).toBeGreaterThan(2); expect(errors).toEqual([]);
});
test("interrupted saved run restores explicitly and can resume with saved text", async ({ page }) => {
  const documentId = crypto.randomUUID(); const id = crypto.randomUUID();
  const document = { id: documentId, name: "Transformer Notes.txt", type: "txt", mimeType: "text/plain", size: 15, contentRef: documentId, parseStatus: "completed", metadata: { addedAt: new Date().toISOString() } };
  const snapshot = WorkspaceSnapshotSchema.parse({ id, name: "Notes", revision: 2, documents: [document], texts: { [documentId]: "Transformer attention lecture notes." }, proposal: null, run: { id: crypto.randomUUID(), engine: "mock", status: "running", simulation: true, startedAt: Date.now(), documents: [document], steps: [], activity: [], progress: 10 }, updatedAt: new Date().toISOString() });
  await persistentTransport(page, snapshot); await page.goto(`/workspace?workspace=${id}`);
  await expect(page.getByRole("heading", { name: "整理已中断" })).toBeVisible(); await page.getByRole("button", { name: "继续分析" }).click();
  await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible();
});
test("saved workspace load failure is visible; default dashboard has no fake totals", async ({ page }) => {
  const unauthorized = await page.request.get(`/api/workspaces/${crypto.randomUUID()}`, { headers: { cookie: `filemind-session=${crypto.randomUUID()}.forged-signature` } });
  expect(unauthorized.status()).toBe(404);
  await page.route("**/api/workspace-config", route => route.fulfill({ json: { persistent: true, intelligence: false, label: "Mock" } }));
  await page.route("**/api/workspaces/*", route => route.fulfill({ status: 404, json: { error: "工作区不存在或无法访问。" } }));
  await page.goto(`/workspace?workspace=${crypto.randomUUID()}`); await expect(page.getByRole("alert").filter({ hasText: "工作区不存在或无法访问。" })).toBeVisible();
  await page.goto("/dashboard"); await expect(page.getByText("还没有保存的工作区")).toBeVisible();
});
test("LLM transport failure offers explicit local fallback and preserves human review", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await persistentTransport(page, undefined, true);
  await page.route("**/api/ai/agent", route => route.fulfill({ status: 503, json: { error: "AI 服务暂时不可用，请稍后重试。" } }));
  await page.goto("/workspace"); await page.getByLabel("选择本地文件").setInputFiles([textFile("Transformer Notes.txt")]);
  await page.getByRole("button", { name: "开始整理" }).click(); await expect(page.getByRole("heading", { name: "整理助手需要重新启动" })).toBeVisible();
  await page.getByRole("button", { name: "使用本地规则继续整理" }).click();
  await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible(); await expect(page.getByText("AI 分析不可用，当前使用本地规则整理。")).toBeVisible();
  await expect(page.getByRole("button", { name: "应用方案" })).toBeVisible(); expect(errors).toEqual([]);
});
test("persistent retry saves review before immediate apply and survives refresh", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const transport = await persistentTransport(page);
  await page.goto("/workspace"); await page.getByLabel("选择本地文件").setInputFiles([textFile()]);
  await page.getByText("演示控制 · 测试故障恢复").click(); await page.getByLabel("模拟故障").selectOption("tool");
  await page.getByRole("button", { name: "开始整理" }).click(); await page.getByRole("button", { name: "重试此步骤" }).click();
  await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible(); expect(transport.snapshot().run?.status).toBe("waiting_for_review");
  await page.getByRole("button", { name: "应用方案" }).click(); await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible(); expect(errors).toEqual([]);
});
