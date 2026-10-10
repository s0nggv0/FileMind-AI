import { test, expect } from "@playwright/test";
import { readFile, rm } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { pdfFixture, docxFile, textFile } from "../e2e/fixtures";

test("portable private PostgreSQL: actual upload, review, restore, apply and user isolation", async ({ page, context }) => {
  const config = await (await context.request.get("/api/workspace-config")).json();
  expect(config).toMatchObject({ persistent: true, intelligence: false });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/workspace");
  const files = [
    { name: "portable-paper.pdf", mimeType: "application/pdf", buffer: pdfFixture() },
    docxFile("portable-report.docx"), textFile("portable-notes.txt"),
    { name: "portable-research.md", mimeType: "text/markdown", buffer: Buffer.from("# Portable research\nAttention and transformer models in project notes.") },
  ];
  let workspace: string | null = null;
  let user: string | undefined;
  try {
    await page.getByLabel("选择本地文件").setInputFiles(files);
    await page.getByRole("button", { name: "开始整理" }).click();
    await expect(page.getByRole("heading", { name: "整理建议" })).toBeVisible({ timeout: 45_000 });
    workspace = new URL(page.url()).searchParams.get("workspace");
    expect(workspace).toBeTruthy();
    const before = await (await context.request.get(`/api/workspaces/${workspace}`)).json();
    expect(before.run.engine).toBe("mock");
    expect(before.documents).toHaveLength(4);
    for (const document of before.documents) {
      expect(document.storagePath).toBeTruthy();
      const original = await readFile(resolve(".filemind/storage", document.storagePath));
      expect(createHash("sha256").update(original).digest("hex")).toBe(document.contentHash);
      expect(original.equals(files.find(file => file.name === document.name)!.buffer)).toBe(true);
    }
    user = before.documents[0].storagePath.split("/")[0];
    await page.getByLabel("文件分类： portable-notes.txt").selectOption("Research");
    await expect(page.getByText("已保存", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("文件分类： portable-notes.txt")).toHaveValue("Research");
    await page.getByRole("button", { name: "应用方案" }).click();
    await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "工作区已整理" })).toBeVisible();
    await page.getByRole("link", { name: "查看资料库" }).click();
    await expect(page.getByRole("button", { name: /portable-notes.txt/ })).toBeVisible();
    const other = await context.browser()!.newContext();
    try { expect((await other.request.get(`http://127.0.0.1:3081/api/workspaces/${workspace}`)).status()).toBe(404); }
    finally { await other.close(); }
    expect(errors).toEqual([]);
  } finally {
    // This opt-in integration check removes only its own synthetic workspace and files.
    if (workspace && user && /^[a-f0-9-]{36}$/.test(user)) {
      const metadata = JSON.parse(await readFile(".filemind/postgresql/instance.json", "utf8"));
      const password = (await readFile(".filemind/postgresql/admin.password", "utf8")).trim();
      const db = new Client({ host: "127.0.0.1", port: metadata.port, database: "filemind_ai", user: "filemind_admin", password });
      try {
        await db.connect();
        await db.query("delete from filemind.workspaces where id=$1 and user_id=$2", [workspace, user]);
        await db.query("delete from filemind.profiles where id=$1 and not exists(select 1 from filemind.workspaces where user_id=$1)", [user]);
      } finally { await db.end(); }
      const storage = resolve(".filemind/storage");
      const target = resolve(storage, user, workspace);
      const inside = relative(storage, target);
      if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new Error("Invalid synthetic file cleanup path");
      await rm(target, { recursive: true, force: true });
    }
  }
});
