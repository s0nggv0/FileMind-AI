import { defineConfig } from "@playwright/test";
import { browserConfig, standaloneServer } from "./tests/config/playwright";

export default defineConfig({
  ...browserConfig,
  testDir: "./tests",
  testMatch: ["**/e2e/**/*.spec.ts", "**/product/index-preparation.spec.ts", "**/product/readiness-status.spec.ts"],
  use: { ...browserConfig.use, baseURL: "http://127.0.0.1:3074" },
  webServer: standaloneServer(3074, { DATABASE_URL: "", AI_ENGINE: "mock", FILEMIND_DEBUG_UI: "true", COMPETITION_MODE: "false" }),
});
