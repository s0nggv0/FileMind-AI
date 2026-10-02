import { defineConfig } from "@playwright/test";
import offline from "./playwright.config";

export default defineConfig({
  ...offline,
  testDir: "./tests/portable", workers: 1, timeout: 90_000,
  globalTeardown: "./tests/portable/teardown.ts",
  use: { ...offline.use, baseURL: "http://127.0.0.1:3081" },
  webServer: {
    command: ".\\.filemind\\runtime\\node.exe scripts\\portable-start.mjs --port 3081 --mock",
    url: "http://127.0.0.1:3081", reuseExistingServer: false, timeout: 60_000,
  },
});
