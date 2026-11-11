import { defineConfig } from "@playwright/test";
import { isolatedBrowserConfig } from "./tests/config/playwright";
const base = isolatedBrowserConfig("./tests/demo-live", 420_000, "node scripts/verification/verify-demo.mjs [--live]");
export default defineConfig({ ...base, outputDir: process.env.FILEMIND_RECORD_DIR || "test-results", use: { ...base.use, ...(process.env.FILEMIND_RECORD_DIR ? { viewport: {width:1920,height:1080}, video: {mode:"on" as const,size:{width:1920,height:1080}} } : {}) } });
