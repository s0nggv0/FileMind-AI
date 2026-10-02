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
async function review(page: Page) { await page.getByRole("button", { name: "Organize with FileMind" }).click(); await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible({ timeout: 25_000 }); }
async function capture(page: Page, name: string) {
  mkdirSync("artifacts/phase3-qa", { recursive: true });
  await page.evaluate(async () => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
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
  await page.getByLabel("Choose local files").setInputFiles([
    { name: "Transformer-paper.pdf", mimeType: "application/pdf", buffer: pdfFixture() }, docxFile(), docxFile("report.docx"), docxFile("report-final-2.docx"), textFile(),
    { name: "research.md", mimeType: "text/markdown", buffer: Buffer.from("# Research\nAttention notes") },
    { name: "IMG_123.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
    { name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") },
    { name: "photo.jpeg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") }, textFile("remove.txt"),
  ]);
  await page.getByRole("button", { name: "Remove remove.txt", exact: true }).click();
  await expect(page.getByText("9 files", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Organize with FileMind" }).click();
  await expect(page.getByRole("heading", { name: "FileMind Agent" })).toBeVisible();
  await expect(page.getByText("read_document()", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("File parse status").getByText("processing", { exact: true })).toBeVisible();
  await capture(page, "execution-desktop");
  await expect(page.getByLabel("File parse status").getByText("completed", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/1 pages/)).toBeVisible();
  await expect(page.getByText(/Synthetic DOCX content/).first()).toBeVisible();
  await expect(page.getByText(/40 × 20/)).toBeVisible();
  await page.getByLabel("Category for course-notes.txt").selectOption("Research");
  await page.getByLabel("New tag for course-notes.txt").fill("Custom tag"); await page.getByRole("button", { name: "Add tag to course-notes.txt", exact: true }).click();
  await page.getByRole("button", { name: "Remove tag Notes from course-notes.txt", exact: true }).click();
  const rename = page.getByRole("article").filter({ hasText: "project-report-final.docx" }); await rename.getByRole("button", { name: "Ignore", exact: true }).click();
  const duplicate = page.getByRole("article").filter({ hasText: "Potential duplicate" }).filter({ hasText: "report.docx" }); await duplicate.getByRole("button", { name: "Accept", exact: true }).click();
  await capture(page, "review-desktop");
  for (const width of [1280, 768]) { await page.setViewportSize({ width, height: 900 }); await capture(page, `review-${width}`); }
  await page.setViewportSize({ width: 390, height: 844 }); await capture(page, "review-mobile");
  await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole("link", { name: "Settings", exact: true }).click(); await page.getByRole("button", { name: "深色", exact: true }).click();
  await page.getByRole("link", { name: "Workspace", exact: true }).click(); await expect(page.locator("body")).toHaveCSS("color", "rgb(236, 242, 238)");
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" }); await page.setViewportSize({ width: 390, height: 844 }); await capture(page, "review-mobile-dark-reduced");
  await page.getByRole("button", { name: "Apply organization plan" }).click(); await expect(page.getByRole("heading", { name: "Workspace organized" })).toBeVisible();
  await capture(page, "completed-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "View Library" }).click(); await expect(page.getByRole("button", { name: /final2.docx/ })).toBeVisible();
  await expect(page.getByText("1 accepted duplicate candidate groups · all files kept")).toBeVisible();
  await page.getByRole("button", { name: /course-notes.txt/ }).click(); await expect(page.getByRole("dialog")).toContainText("Custom tag"); await expect(page.getByRole("dialog")).toContainText("Research"); await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Knowledge Graph", exact: true }).click(); await page.getByRole("button", { name: "This session · 9 files" }).click(); await expect(page.getByRole("button", { name: /文件：Transformer/ })).toBeVisible();
  await page.getByRole("link", { name: "Workspace", exact: true }).click(); await page.getByRole("button", { name: "Start another workspace" }).click(); await expect(page.getByRole("heading", { name: "Drop your files here" })).toBeVisible();
});
test("empty, invalid format, oversized file, over count, remove and clear", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Organize with FileMind" })).toHaveCount(0);
  await page.getByLabel("Choose local files").setInputFiles([{ name: "unsafe.html", mimeType: "text/html", buffer: Buffer.from("x") }, { name: "huge.txt", mimeType: "text/plain", buffer: Buffer.alloc(20 * 1024 * 1024 + 1) }]);
  await expect(page.getByRole("alert").filter({ hasText: "Unsupported file format" })).toContainText("File exceeds 20 MB");
  await page.getByLabel("Choose local files").setInputFiles(Array.from({ length: 31 }, (_, index) => textFile(`file-${index}.txt`)));
  await expect(page.getByRole("alert").filter({ hasText: "Maximum 30 files" })).toBeVisible(); await expect(page.getByText("30 files", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click(); await expect(page.getByRole("button", { name: "Organize with FileMind" })).toHaveCount(0);
});
test("single-file drag and drop completes with zero relationships", async ({ page }) => {
  await page.getByRole("heading", { name: "Drop your files here" }).evaluate((heading) => { const transfer = new DataTransfer(); transfer.items.add(new File(["plain text"], "unknown.txt", { type: "text/plain" })); heading.parentElement!.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); });
  await review(page); await expect(page.getByText("No shared topics found for these files.")).toBeVisible();
  await page.getByRole("button", { name: "Apply organization plan" }).click(); await expect(page.getByText("1 documents organized")).toBeVisible();
});
test("real corrupt DOCX fails locally, retry fails again, skip preserves a valid file", async ({ page }) => {
  await page.getByLabel("Choose local files").setInputFiles([{ ...docxFile("broken.docx"), buffer: Buffer.from("corrupt") }, textFile()]);
  await page.getByRole("button", { name: "Organize with FileMind" }).click();
  await page.getByRole("button", { name: "Retry step" }).click(); await page.getByRole("button", { name: "Skip document" }).click();
  await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible(); await expect(page.getByText(/1 files processed · 1 skipped/)).toBeVisible();
});
for (const fault of ["parse", "tool", "agent"] as const) {
  test(`injected ${fault} failure recovers`, async ({ page }) => {
    await page.getByLabel("Choose local files").setInputFiles([textFile()]); await page.getByText("Demo controls · test error recovery").click();
    await page.getByLabel("Demo failure").selectOption(fault); await page.getByRole("button", { name: "Organize with FileMind" }).click();
    await page.getByRole("button", { name: fault === "agent" ? "Restart" : "Retry step", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible();
  });
}
test("cancellation has no late review and restart succeeds", async ({ page }) => {
  await page.getByLabel("Choose local files").setInputFiles([textFile()]); await page.getByRole("button", { name: "Organize with FileMind" }).click(); await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organization stopped" })).toBeVisible(); await expect(page.getByText("Your files were not changed.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restart", exact: true }).click(); await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible();
});
