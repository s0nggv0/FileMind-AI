import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

// Keep the release layout identical to the source layout for relative imports.
export const portableRuntimeScripts = [
  "scripts/portable-start.mjs",
  "scripts/runtime/portable-start.mjs",
  "scripts/runtime/portable-paths.mjs",
  "scripts/database/migrate-database.mjs",
  "scripts/runtime/startup-recovery.mjs",
  "scripts/runtime/storage-recovery.mjs",
  "scripts/runtime/operation-lease.mjs",
];

export async function copyPortableRuntimeScripts(source, target) {
  for (const name of portableRuntimeScripts) {
    const destination = join(target, name);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(source, name), destination);
  }
}
