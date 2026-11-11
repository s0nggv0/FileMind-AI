import { defineConfig } from "@playwright/test";
import live from "./playwright.rag-live.config";
export default defineConfig({ ...live, testDir: "./tests/multimodal-live", timeout: 300000, expect: { timeout: 30000 } });
