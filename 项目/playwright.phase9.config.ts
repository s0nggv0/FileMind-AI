import { defineConfig } from "@playwright/test";
import config from "./playwright.config";
import { standaloneServer } from "./tests/config/playwright";
export default defineConfig({
  ...config, testIgnore: [], testMatch: "**/phase9-delivery.spec.ts", timeout: 90_000,
  use: { ...config.use, baseURL: "http://127.0.0.1:3081" },
  webServer: standaloneServer(3081, {
    DATABASE_URL: "", AI_ENGINE: "mock", COMPETITION_MODE: "true", FILEMIND_DEBUG_UI: "true",
  }),
});
