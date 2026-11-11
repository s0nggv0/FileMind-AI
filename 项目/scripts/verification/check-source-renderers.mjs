import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Inspect whole reading surfaces so extracted or newly added components remain
// covered. This static guard is not a complete browser/XSS security assessment.
export async function checkSourceRenderers(root) {
  const files = [];
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(path);
      else if (entry.isFile() && entry.name.endsWith(".tsx")) {
        const label = relative(root, path).replaceAll("\\", "/");
        assert.ok(!(await readFile(path, "utf8")).includes("dangerouslySetInnerHTML"), `Raw HTML rendering is forbidden in ${label}`);
        files.push(label);
      }
    }
  }
  for (const directory of ["src/features/search", "src/features/library", "src/components/knowledge"]) {
    await inspect(join(root, directory));
  }
  return files.sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = await checkSourceRenderers(process.cwd());
  console.log(JSON.stringify({ scope: "static raw-HTML guard; not HTTP or browser acceptance", files: files.length, passed: true }, null, 2));
}
