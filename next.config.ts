import type { NextConfig } from "next";
import { readFileSync, existsSync } from "node:fs";
const metadataPath = ".filemind/build-info.json";
const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath,"utf8")) as Record<string,string> : { BUILD_VERSION:"development", BUILD_COMMIT:"unbuilt", BUILD_DATE:"" };

const nextConfig: NextConfig = {
  output: "standalone",
  env: { BUILD_VERSION: metadata.BUILD_VERSION, BUILD_COMMIT: metadata.BUILD_COMMIT, BUILD_DATE: metadata.BUILD_DATE },
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: { "/*": ["./node_modules/@img/sharp-win32-x64/**/*", "./node_modules/tesseract.js/**/*", "./node_modules/tesseract.js-core/**/*", "./node_modules/@tesseract.js-data/eng/**/*", "./node_modules/@tesseract.js-data/chi_sim/**/*"] },
  outputFileTracingExcludes: { "/*": ["./.filemind/**/*", "./artifacts/**/*", "./.env*", "./.git/**/*"] },
};

export default nextConfig;
