import { test, expect } from "@playwright/test";
import { pdfFixture, docxFile, textFile } from "../e2e/fixtures";
// Explicit opt-in command. Uploads only synthetic documents, and uses paid AI.
test("live Supabase + OpenAI: mixed documents → review → autosave → apply → recovery", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", event => { if (event.type() === "error") errors.push(event.text()); });
  const config = await (await context.request.get("/api/workspace-config")).json();
  expect(config.persistent, "Configure Supabase before running test:live").toBe(true);
  expect(config.intelligence, "Set AI_ENGINE=llm before running test:live").toBe(true);
  await page.goto("/workspace");
  await page.getByLabel("Choose local files").setInputFiles([
    { name: "Transformer Notes.pdf", mimeType: "application/pdf", buffer: pdfFixture() },
    { name: "NLP Lecture.md", mimeType: "text/markdown", buffer: Buffer.from("# NLP Lecture\nTransformer networks use self-attention to model relationships between tokens. Lecture material on tokenization, attention heads and positional encoding.") },
    docxFile("final2.docx"), textFile("research.txt"),
  ]);
  await page.getByRole("button", { name: "Organize with FileMind" }).click();
  await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible({ timeout: 260_000 });
  const id = new URL(page.url()).searchParams.get("workspace"); expect(id).toBeTruthy();
  const before = await (await context.request.get(`/api/workspaces/${id}`)).json();
  expect(before.run.engine).toBe("llm"); expect(before.run.result.simulation).toBe(false); expect(before.run.fallback).toBeUndefined(); expect(before.run.usage.totalTokens).toBeGreaterThan(0);
  expect(before.documents.every((d: { storagePath?: string }) => Boolean(d.storagePath))).toBe(true);
  await page.getByLabel("Category for research.txt").selectOption("Research");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel("Category for research.txt")).toHaveValue("Research");
  await page.getByRole("button", { name: "Apply organization plan" }).click(); await expect(page.getByRole("heading", { name: "Workspace organized" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "Workspace organized" })).toBeVisible();
  await page.getByRole("link", { name: "View Library" }).click(); await expect(page.getByRole("button", { name: /Transformer Notes.pdf/ })).toBeVisible();
  const other = await context.browser()!.newContext();
  const unauthorized = await other.request.get(`http://127.0.0.1:3075/api/workspaces/${id}`); expect(unauthorized.status()).toBe(404); await other.close();
  expect(errors).toEqual([]);
  console.log(`Live verified: engine=${before.run.engine}, model=${before.run.model}, documents=${before.documents.length}, workspace=${id}`);
});
