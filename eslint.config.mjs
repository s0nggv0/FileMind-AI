import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/components/{ui,common,knowledge}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/features", "@/features/**", "**/features", "**/features/**"],
          allowTypeImports: true,
          message: "Shared UI and knowledge components must not depend on feature implementations.",
        }],
      }],
    },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/features/**", "**/features/**", "@/components/**", "**/components/**"],
          message: "Shared business and server modules must not depend on UI features or components.",
        }],
      }],
    },
  },
  globalIgnores([".next/**", "node_modules/**", ".npm-cache/**", "artifacts/**", "test-results/**", "public/pdf.worker.min.mjs", "public/pdfjs/**", "next-env.d.ts"]),
]);
