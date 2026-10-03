import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: { "/*": ["./node_modules/tesseract.js/**/*", "./node_modules/tesseract.js-core/**/*", "./node_modules/@tesseract.js-data/eng/**/*", "./node_modules/@tesseract.js-data/chi_sim/**/*"] },
};

export default nextConfig;
