import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

for (const width of [390, 1440]) test(`landing citations reveal attributed examples at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "体验引用核对" }).click();
  await page.getByRole("button", { name: "查看示例引用 1" }).focus();
  await page.keyboard.press("Enter");
  const source = page.getByRole("region", { name: "示例来源摘录" });
  await expect(source).toContainText("注意力课程笔记.txt");
  await expect(source.locator("mark")).toContainText("Query 表示当前要查找的信息");
  await page.getByRole("button", { name: "查看示例引用 2" }).click();
  await expect(source).toContainText("注意力复习卡片.md");
  await expect(source).not.toContainText("注意力课程笔记.txt");
  await expect(page.getByText("预设交互示例 · 原创示例文字 · 未调用模型")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir("artifacts/competition-release/screenshots", { recursive: true });
  await page.screenshot({ path: `artifacts/competition-release/screenshots/landing-citation-${width}.png`, animations: "disabled" });
});
