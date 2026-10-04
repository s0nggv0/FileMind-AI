import nextEnv from "@next/env";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
let databasePassword;
try { databasePassword = decodeURIComponent(new URL(process.env.DATABASE_URL).password); } catch {}
const secrets = [...new Set([process.env.KIMI_API_KEY, process.env.EMBEDDING_API_KEY, process.env.DASHSCOPE_API_KEY, process.env.WORKSPACE_SESSION_SECRET, databasePassword].filter(key => key?.length > 12))];
let checkedFiles = 0;
async function scan(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await scan(path);
    else { const bytes = await readFile(path); checkedFiles++; if (secrets.some(secret => bytes.includes(Buffer.from(secret)))) throw new Error("A configured secret was found in browser build assets."); }
  }
}
try { await scan(".next/static"); console.log(JSON.stringify({ passed: true, configuredSecretsChecked: secrets.length, browserAssetsChecked: checkedFiles })); }
catch { console.error("Secret boundary verification failed; no credential or raw asset was printed."); process.exitCode = 1; }
