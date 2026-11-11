import { defineConfig } from "@playwright/test";
import { isolatedBrowserConfig } from "./tests/config/playwright";
export default defineConfig(isolatedBrowserConfig("./tests/reliability-live", 90_000, "node scripts/verification/verify-phase8-maintenance.mjs"));
