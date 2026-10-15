import { cp, mkdir, access, readdir, lstat, realpath, unlink, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const exists = path => access(path).then(() => true, () => false);

async function materializeLinks(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      const source = await realpath(path);
      const temporary = `${path}.portable-${randomUUID()}`;
      await cp(source, temporary, { recursive: true, dereference: true });
      // Remove only the verified link itself; its source is never modified.
      await unlink(path);
      await rename(temporary, path);
    } else if (info.isDirectory()) await materializeLinks(path);
  }
}
try {
  const standalone = join(root, ".next/standalone");
  if (!(await exists(join(standalone, "server.js")))) throw new Error("Run npm run build before preparing the portable folder.");
  await cp(join(root, "public"), join(standalone, "public"), { recursive: true });
  await cp(join(root, ".filemind/build-info.json"), join(standalone, "build-info.json"));
  await cp(join(root, "tests/fixtures/demo"), join(standalone, "tests/fixtures/demo"), { recursive: true });
  await cp(join(root, ".next/static"), join(standalone, ".next/static"), { recursive: true });
  // Turbopack may trace absolute dependency symlinks. A moved folder needs real files.
  await materializeLinks(standalone);
  const postgresSource = option("--postgres-runtime");
  if (postgresSource) {
    const source = resolve(postgresSource);
    for (const name of ["postgres.exe", "initdb.exe", "pg_ctl.exe"]) {
      if (!(await exists(join(source, "bin", name)))) throw new Error("PostgreSQL runtime source is incomplete.");
    }
    await cp(source, join(root, ".filemind/postgresql/runtime/pgsql"), { recursive: true });
    // App-local VC libraries keep PostgreSQL independent of a machine-wide installer.
    const vcSource = resolve(option("--vc-runtime") || join(process.env.SystemRoot || "C:/Windows", "System32"));
    for (const name of ["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"]) {
      if (!(await exists(join(vcSource, name)))) throw new Error(`Missing x64 Visual C++ runtime library: ${name}`);
      await cp(join(vcSource, name), join(root, ".filemind/postgresql/runtime/pgsql/bin", name));
    }
  }
  if (postgresSource || option("--node-runtime")) {
    const nodeSource = resolve(option("--node-runtime") || process.execPath);
    const destination = join(root, ".filemind/runtime");
    await mkdir(destination, { recursive: true });
    await cp(nodeSource, join(destination, "node.exe"));
    for (const name of ["LICENSE", "LICENSE.md"]) {
      if (await exists(join(dirname(nodeSource), name))) await cp(join(dirname(nodeSource), name), join(destination, `node-${name}`));
    }
  }
  console.log("Portable build assets prepared. Local runtime and private data stay out of Git.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Portable preparation failed.");
  process.exitCode = 1;
}
