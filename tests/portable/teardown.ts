import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export default function stopPortableServices() {
  const result = spawnSync(resolve(".filemind/runtime/node.exe"), [resolve("scripts/portable-start.mjs"), "--stop"], { windowsHide: true, encoding: "utf8", timeout: 50_000 });
  if (result.status !== 0) throw new Error("Portable test services could not stop cleanly; stop FileMind before copying its folder.");
}
