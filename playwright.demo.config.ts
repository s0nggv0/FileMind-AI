import { defineConfig } from "@playwright/test";
import { isolatedBrowserConfig } from "./tests/config/playwright";
export default defineConfig(isolatedBrowserConfig("./tests/demo-live", 420_000, "node scripts/verification/verify-demo.mjs [--live]"));
