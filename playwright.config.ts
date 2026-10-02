import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ?? (existsSync(edge) ? edge : undefined);

export default defineConfig({
  testDir: "./tests/e2e", timeout: 45_000, expect: { timeout: 15_000 }, fullyParallel: true, workers: 2,
  use: { baseURL: "http://127.0.0.1:3074", browserName: "chromium", headless: true, viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } },
  webServer: {
    command: "node .next/standalone/server.js", url: "http://127.0.0.1:3074", reuseExistingServer: false, timeout: 30_000,
    env: { HOSTNAME: "127.0.0.1", PORT: "3074", DATABASE_URL: "", AI_ENGINE: "mock", WORKSPACE_ORIGIN: "http://127.0.0.1:3074" },
  },
  reporter: "list",
});
