import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { copyPortableRuntimeScripts, portableRuntimeScripts } from "../scripts/release/runtime-assets.mjs";

test("the release script allowlist supports the stable launcher from a relocated folder and another working directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "filemind-script-layout-"));
  try {
    await copyPortableRuntimeScripts(resolve("."), root);
    for (const name of portableRuntimeScripts) assert.ok((await readFile(join(root, name))).length > 0);
    // A misplaced project root would read this sentinel as a launcher lock.
    const sentinel = join(root, "scripts/.filemind/launcher.lock");
    await mkdir(join(root, "scripts/.filemind"), { recursive: true });
    await writeFile(sentinel, "wrong project root");
    const otherDirectory = join(root, "another directory 迁移");
    await mkdir(otherDirectory);
    for (const entry of ["scripts/portable-start.mjs", "scripts/runtime/portable-start.mjs"]) {
      const child = spawnSync(process.execPath, [join(root, entry), "--stop"], {
        cwd: otherDirectory, windowsHide: true, encoding: "utf8", timeout: 10_000,
      });
      assert.equal(child.status, 0, child.stderr || child.error?.message || "Portable launcher failed");
      assert.match(child.stdout, /FileMind database stopped/);
    }
    assert.equal(await readFile(sentinel, "utf8"), "wrong project root");
  } finally {
    const cleanupPath = resolve(root);
    assert.match(basename(cleanupPath), /^filemind-script-layout-/);
    assert.equal(relative(resolve(tmpdir()), cleanupPath), basename(cleanupPath));
    await rm(cleanupPath, { recursive: true, force: true });
  }
});
