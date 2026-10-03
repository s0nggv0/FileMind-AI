import { defineConfig } from "@playwright/test";
import offline from "./playwright.config";
// The wrapper creates an empty disposable database, never the private instance.
if (!process.env.FILEMIND_TEST_ROOT || !process.env.FILEMIND_TEST_ORIGIN) throw new Error("Run node scripts/verify-phase8-rag.mjs --live");
export default defineConfig({ ...offline, testDir: "./tests/rag-live", workers: 1, timeout: 240_000, use: { ...offline.use, baseURL: process.env.FILEMIND_TEST_ORIGIN }, webServer: undefined });
