import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { docxFile, pdfFixture, textFile } from "./fixtures";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (event) => { if (event.type() === "error") errors.push(event.text()); });
  page.on("request", (request) => { expect(request.method()).not.toBe("POST"); expect(new URL(request.url()).hostname).toBe("127.0.0.1"); });
  await page.goto("/workspace");
  (page as Page & { qaErrors: string[] }).qaErrors = errors;
});
test.afterEach(async ({ page }) => { expect((page as Page & { qaErrors: string[] }).qaErrors).toEqual([]); });
async function review(page: Page) { await page.getByRole("button", { name: "开始整理" }).click(); await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible({ timeout: 25_000 }); }
async function capture(page: Page, name: string) {
  mkdirSync("artifacts/phase3-qa", { recursive: true });
  await page.evaluate(async () => { await document.fonts.ready; if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: `artifacts/phase3-qa/${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test("real mixed files → visible tools → editable review → session Library and Graph → reset", async ({ page }) => {
  await capture(page, "upload-desktop");
  await page.setViewportSize({ width: 390, height: 844 }); await capture(page, "upload-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  const png = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 40; canvas.height = 20; return canvas.toDataURL("image/png").split(",")[1]; });
  const jpeg = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 30; canvas.height = 10; return canvas.toDataURL("image/jpeg").split(",")[1]; });
  await page.getByLabel("选择本地文件").setInputFiles([
    { name: "Transformer-paper.pdf", mimeType: "application/pdf", buffer: pdfFixture() }, docxFile(), docxFile("report.docx"), docxFile("report-final-2.docx"), textFile(),
    { name: "research.md", mimeType: "text/markdown", buffer: Buffer.from("# Research\nAttention notes") },
    { name: "IMG_123.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
    { name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") },
    { name: "photo.jpeg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") }, textFile("remove.txt"),
  ]);
  await page.getByRole("button", { name: "移除 remove.txt", exact: true }).click();
  await expect(page.getByText("9 份文件", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "开始整理" }).click();
  await expect(page.getByRole("heading", { name: "AI 整理助手" })).toBeVisible();
  await page.getByText("查看详细执行步骤与日志", { exact: true }).click();
  await expect(page.getByText("读取资料", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("文件解析状态").getByText("处理中", { exact: true })).toBeVisible();
  await capture(page, "execution-desktop");
  await expect(page.getByLabel("文件解析状态").getByText("已完成", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/已完成 · 1 页/)).toBeVisible();
  await expect(page.getByText(/Synthetic DOCX content/).first()).toBeVisible();
  await expect(page.getByText(/40 × 20/)).toBeVisible();
  await page.getByLabel("文件分类： course-notes.txt").selectOption("Research");
  await page.getByLabel("新标签： course-notes.txt").fill("Custom tag"); await page.getByRole("button", { name: "添加标签： course-notes.txt", exact: true }).click();
  await page.getByRole("button", { name: "移除 course-notes.txt 的标签 Notes", exact: true }).click();
  const rename = page.getByRole("article").filter({ hasText: "project-report-final.docx" }); await rename.getByRole("button", { name: "忽略", exact: true }).click();
  const duplicate = page.getByRole("article").filter({ hasText: "文件完全相同" }).filter({ hasText: "report.docx" }); await duplicate.getByRole("button", { name: "接受", exact: true }).click();
  await capture(page, "review-desktop");
  for (const width of [1280, 768]) { await page.setViewportSize({ width, height: 900 }); await capture(page, `review-${width}`); }
  await page.setViewportSize({ width: 390, height: 844 }); await capture(page, "review-mobile");
  await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole("link", { name: "设置", exact: true }).click(); await page.getByRole("button", { name: "深色", exact: true }).click();
  await page.getByRole("link", { name: "工作区", exact: true }).click(); await expect(page.locator("body")).toHaveCSS("color", "rgb(236, 242, 238)");
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" }); await page.setViewportSize({ width: 390, height: 844 }); await capture(page, "review-mobile-dark-reduced");
  await page.getByRole("button", { name: "应用方案" }).click(); await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible();
  await capture(page, "completed-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "查看资料库" }).click(); await expect(page.getByRole("button", { name: /final2.docx/ })).toBeVisible();
  await expect(page.getByText("1 组已确认的重复候选 · 保留全部文件")).toBeVisible();
  await page.getByRole("button", { name: /course-notes.txt/ }).click(); await expect(page.getByRole("dialog")).toContainText("Custom tag"); await expect(page.getByRole("dialog")).toContainText("研究"); await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "知识图谱", exact: true }).click(); await page.getByRole("button", { name: "当前会话 · 9 份文件" }).click(); await expect(page.getByRole("button", { name: /文件：Transformer/ })).toBeVisible();
  await page.getByRole("link", { name: "工作区", exact: true }).click(); await page.getByRole("button", { name: "新建工作区" }).click(); await expect(page.getByRole("heading", { name: "在这里导入文件" })).toBeVisible();
});
test("empty, invalid format, oversized file, over count, remove and clear", async ({ page }) => {
  await expect(page.getByRole("button", { name: "开始整理" })).toHaveCount(0);
  await page.getByLabel("选择本地文件").setInputFiles([{ name: "unsafe.html", mimeType: "text/html", buffer: Buffer.from("x") }, { name: "huge.txt", mimeType: "text/plain", buffer: Buffer.alloc(20 * 1024 * 1024 + 1) }]);
  await expect(page.getByRole("alert").filter({ hasText: "不支持此文件格式" })).toContainText("文件超过 20 MB");
  await page.getByLabel("选择本地文件").setInputFiles(Array.from({ length: 31 }, (_, index) => textFile(`file-${index}.txt`)));
  await expect(page.getByRole("alert").filter({ hasText: "最多 30 份文件" })).toBeVisible(); await expect(page.getByText("30 份文件", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "清空列表" }).click(); await expect(page.getByRole("button", { name: "开始整理" })).toHaveCount(0);
});
test("single-file drag and drop completes with zero relationships", async ({ page }) => {
  await page.getByRole("heading", { name: "在这里导入文件" }).evaluate((heading) => { const transfer = new DataTransfer(); transfer.items.add(new File(["plain text"], "unknown.txt", { type: "text/plain" })); heading.parentElement!.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); });
  await review(page); await expect(page.getByText("这些文件没有共同主题。")).toBeVisible();
  await page.getByRole("button", { name: "应用方案" }).click(); await expect(page.getByText(/1 份资料 · 1 个分类/)).toBeVisible();
});
test("real corrupt DOCX fails locally, retry fails again, skip preserves a valid file", async ({ page }) => {
  await page.getByLabel("选择本地文件").setInputFiles([{ ...docxFile("broken.docx"), buffer: Buffer.from("corrupt") }, textFile()]);
  await page.getByRole("button", { name: "开始整理" }).click();
  await page.getByRole("button", { name: "重试此步骤" }).click(); await page.getByRole("button", { name: "跳过此文件" }).click();
  await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible(); await expect(page.getByText(/1 份文件已处理 · 1 份已跳过/)).toBeVisible();
});
for (const fault of ["parse", "tool", "agent"] as const) {
  test(`injected ${fault} failure recovers`, async ({ page }) => {
    await page.getByLabel("选择本地文件").setInputFiles([textFile()]); await page.getByText("演示控制 · 测试故障恢复").click();
    await page.getByLabel("模拟故障").selectOption(fault); await page.getByRole("button", { name: "开始整理" }).click();
    await page.getByRole("button", { name: fault === "agent" ? "重新启动" : "重试此步骤", exact: true }).click();
    await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible();
  });
}
test("cancellation has no late review and restart succeeds", async ({ page }) => {
  await page.getByLabel("选择本地文件").setInputFiles([textFile()]); await page.getByRole("button", { name: "开始整理" }).click(); await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("heading", { name: "整理已停止" })).toBeVisible(); await expect(page.getByText("文件未被修改。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重新启动", exact: true }).click(); await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible();
});
