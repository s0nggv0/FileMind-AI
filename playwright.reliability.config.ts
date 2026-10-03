import { defineConfig } from "@playwright/test";
import offline from "./playwright.config";
if(!process.env.FILEMIND_TEST_ROOT || !process.env.FILEMIND_TEST_ORIGIN)throw new Error("Run node scripts/verify-phase8-maintenance.mjs");
export default defineConfig({...offline,testDir:"./tests/reliability-live",workers:1,timeout:90000,use:{...offline.use,baseURL:process.env.FILEMIND_TEST_ORIGIN},webServer:undefined});
