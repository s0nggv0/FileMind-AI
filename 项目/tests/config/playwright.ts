import { existsSync } from "node:fs";
import type { PlaywrightTestConfig } from "@playwright/test";

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ?? (existsSync(edge) ? edge : undefined);

export const browserConfig = {
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  testIgnore: "**/phase9-delivery.spec.ts",
  use: {
    browserName: "chromium", headless: true,
    viewport: { width: 1440, height: 900 }, launchOptions: { executablePath },
  },
  reporter: "list",
} satisfies PlaywrightTestConfig;

export function standaloneServer(port: number, env: Record<string, string>) {
  const origin = `http://127.0.0.1:${port}`;
  return {
    command: "node .next/standalone/server.js", url: origin, reuseExistingServer: false, timeout: 30_000,
    env: { HOSTNAME: "127.0.0.1", PORT: String(port), WORKSPACE_ORIGIN: origin, ...env },
  };
}

export function isolatedBrowserConfig(testDir: string, timeout: number, command: string): PlaywrightTestConfig {
  if (!process.env.FILEMIND_TEST_ROOT || !process.env.FILEMIND_TEST_ORIGIN) throw new Error(`Run ${command}`);
  return {
    ...browserConfig, testDir, workers: 1, timeout,
    use: { ...browserConfig.use, baseURL: process.env.FILEMIND_TEST_ORIGIN }, webServer: undefined,
  };
}
