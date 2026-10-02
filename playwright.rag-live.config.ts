import { defineConfig } from "@playwright/test";
import offline from "./playwright.config";
// Explicit opt-in: start the private portable server on 3082 without --mock.
export default defineConfig({ ...offline, testDir: "./tests/rag-live", workers: 1, timeout: 180_000, use: { ...offline.use, baseURL: "http://127.0.0.1:3082" }, webServer: undefined });
