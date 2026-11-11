import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
mkdirSync(new URL("../../public/", import.meta.url), { recursive: true });
copyFileSync(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"), new URL("../../public/pdf.worker.min.mjs", import.meta.url));
const packageRoot = new URL("./", pathToFileURL(require.resolve("pdfjs-dist/package.json")));
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  cpSync(new URL(directory, packageRoot), new URL(`../../public/pdfjs/${directory}`, import.meta.url), { recursive: true });
}
