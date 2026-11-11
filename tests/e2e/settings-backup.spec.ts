import { test, expect } from "@playwright/test";

test("settings validates before import, supports cancellation and reports real export stages", async ({ page }) => {
  let imports = 0;
  await page.route("**/api/identity", route => route.fulfill({ json: { available: true, configured: false, lastBackupAt: null } }));
  await page.route("**/api/backup/validate", route => route.fulfill({ json: { createdAt: "2026-10-03T01:00:00Z", filemindVersion: "0.1.0", workspaces: 1, documents: 3, files: 3, images: 1, chunks: 5, embeddingModel: "fixture", embeddingCompatible: false, visionCompatible: true, duplicates: 1 } }));
  await page.route("**/api/backup/import?*", route => { imports++; return route.fulfill({ json: { documents: 2, skippedDocuments: 1, workspaceIds: [], reindexRequired: true } }); });
  await page.route("**/api/backup/export", route => route.fulfill({ contentType: "application/x-ndjson", body: ["正在准备备份信息", "Collecting files", "Generating manifest", "Calculating checksums", "Packaging", "已完成"].map(stage => JSON.stringify({ type: "stage", stage })).join("\n") + "\n" + JSON.stringify({ type: "result", filename: "synthetic.filemind-backup", createdAt: "2026-10-03T01:00:00Z", base64: Buffer.from("synthetic transport fixture").toString("base64") }) + "\n" }));
  await page.goto("/settings");
  await expect(page.getByText("最近备份： 尚未导出")).toBeVisible();
  await page.getByLabel("FileMind 备份文件").setInputFiles({ name: "synthetic.filemind-backup", mimeType: "application/zip", buffer: Buffer.from("synthetic transport fixture") });
  await expect(page.getByRole("button", { name: "导入备份", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "校验备份" }).click();
  await expect(page.getByLabel("备份导入预览")).toBeVisible();
  await expect(page.getByLabel("跳过重复资料")).toBeChecked();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(imports).toBe(0);
  await expect(page.getByLabel("备份导入预览")).toHaveCount(0);
  await page.getByLabel("FileMind 备份文件").setInputFiles({ name: "synthetic.filemind-backup", mimeType: "application/zip", buffer: Buffer.from("synthetic transport fixture") });
  await page.getByRole("button", { name: "校验备份" }).click();
  await page.getByRole("button", { name: "导入备份", exact: true }).click();
  await expect(page.getByText("恢复了 2 份资料，跳过 1 份重复文件。")).toBeVisible();
  await expect(page.getByRole("button", { name: "重建已恢复资料的索引" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 FileMind 备份" }).click();
  expect((await download).suggestedFilename()).toBe("synthetic.filemind-backup");
  await expect(page.getByText("备份已下载。")).toBeVisible();
  expect(imports).toBe(1);
});

test("corrupt backup displays validation error and cannot enable import", async ({ page }) => {
  await page.route("**/api/identity", route => route.fulfill({ json: { available: true, configured: true, lastBackupAt: null } }));
  await page.route("**/api/backup/validate", route => route.fulfill({ status: 400, json: { error: "Backup integrity check failed." } }));
  await page.goto("/settings");
  await page.getByLabel("FileMind 备份文件").setInputFiles({ name: "corrupt.filemind-backup", mimeType: "application/zip", buffer: Buffer.from("corrupt") });
  await page.getByRole("button", { name: "校验备份" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Backup integrity check failed." })).toHaveText("Backup integrity check failed.");
  await expect(page.getByRole("button", { name: "导入备份", exact: true })).toHaveCount(0);
});
