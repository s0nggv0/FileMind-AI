import { defineConfig } from "@playwright/test";
import { browserConfig } from "./tests/config/playwright";
export default defineConfig({ ...browserConfig, testDir:"./tests/product", workers:1, timeout:120000,
  use:{...browserConfig.use,baseURL:process.env.FILEMIND_TEST_ORIGIN ?? "http://127.0.0.1:3091"}, webServer:undefined });
