import { defineConfig } from "@playwright/test";
import { isolatedBrowserConfig } from "./tests/config/playwright";
// The wrapper creates an empty disposable database, never the private instance.
export default defineConfig(isolatedBrowserConfig("./tests/rag-live", 240_000, "node scripts/verification/verify-phase8-rag.mjs --live"));
