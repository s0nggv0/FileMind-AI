import { test, expect } from "@playwright/test";
import { pdfFixture, docxFile, textFile } from "../e2e/fixtures";
// Explicit opt-in command. Uploads only synthetic documents, and uses paid AI.
test("live persistent storage + Kimi: mixed documents → review → autosave → apply → recovery", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", event => { if (event.type() === "error") errors.push(event.text()); });
  const config = await (await context.request.get("/api/workspace-config")).json();
  expect(config.persistent, "Configure a supported persistence backend before running test:live").toBe(true);
  expect(config.intelligence, "Set AI_ENGINE=llm before running test:live").toBe(true);
  await page.goto("/workspace");
  await page.getByLabel("选择本地文件").setInputFiles([
    { name: "Transformer Notes.pdf", mimeType: "application/pdf", buffer: pdfFixture() },
    { name: "NLP Lecture.md", mimeType: "text/markdown", buffer: Buffer.from("# NLP Lecture\nTransformer networks use self-attention to model relationships between tokens. Lecture material on tokenization, attention heads and positional encoding.") },
    docxFile("final2.docx"), textFile("research.txt"),
  ]);
  await page.getByRole("button", { name: "开始整理" }).click();
  await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible({ timeout: 260_000 });
  const id = new URL(page.url()).searchParams.get("workspace"); expect(id).toBeTruthy();
  const before = await (await context.request.get(`/api/workspaces/${id}`)).json();
  expect(before.run.engine).toBe("llm"); expect(before.run.result.simulation).toBe(false); expect(before.run.fallback).toBeUndefined(); expect(before.run.usage.totalTokens).toBeGreaterThan(0);
  expect(before.documents.every((d: { storagePath?: string }) => Boolean(d.storagePath))).toBe(true);
  await page.getByLabel("文件分类： research.txt").selectOption("Research");
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel("文件分类： research.txt")).toHaveValue("Research");
  await page.getByRole("button", { name: "应用方案" }).click(); await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible();
  await page.getByRole("link", { name: "查看资料库" }).click(); await expect(page.getByRole("button", { name: /Transformer Notes.pdf/ })).toBeVisible();
  const other = await context.browser()!.newContext();
  const unauthorized = await other.request.get(`http://127.0.0.1:3075/api/workspaces/${id}`); expect(unauthorized.status()).toBe(404); await other.close();
  expect(errors).toEqual([]);
  console.log(`Live verified: engine=${before.run.engine}, model=${before.run.model}, documents=${before.documents.length}, workspace=${id}`);
});
