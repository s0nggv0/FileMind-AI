import { defineConfig } from "@playwright/test";
import offline from "./playwright.config";
export default defineConfig({
  ...offline, testDir: "./tests/live", workers: 1, timeout: 300_000,
  use: { ...offline.use, baseURL: "http://127.0.0.1:3075" },
  webServer: { command: "npm run dev -- --hostname 127.0.0.1 --port 3075", url: "http://127.0.0.1:3075", reuseExistingServer: false, timeout: 60_000 },
});
