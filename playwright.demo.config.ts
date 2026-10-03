import { defineConfig } from "@playwright/test";
import offline from "./playwright.config";
if(!process.env.FILEMIND_TEST_ROOT||!process.env.FILEMIND_TEST_ORIGIN)throw new Error("Run node scripts/verify-demo.mjs [--live]");
export default defineConfig({...offline,testDir:"./tests/demo-live",workers:1,timeout:420000,use:{...offline.use,baseURL:process.env.FILEMIND_TEST_ORIGIN},webServer:undefined});
