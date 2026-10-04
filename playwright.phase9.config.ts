import { defineConfig } from "@playwright/test";
import config from "./playwright.config";
export default defineConfig({ ...config, testIgnore: [], testMatch: "**/phase9-delivery.spec.ts", timeout: 90000, use: { ...config.use, baseURL: "http://127.0.0.1:3081" }, webServer: { command:"node .next/standalone/server.js",url:"http://127.0.0.1:3081",timeout:30000,reuseExistingServer:false,env:{HOSTNAME:"127.0.0.1",PORT:"3081",DATABASE_URL:"",AI_ENGINE:"mock",COMPETITION_MODE:"true",FILEMIND_DEBUG_UI:"true",WORKSPACE_ORIGIN:"http://127.0.0.1:3081"} } });
