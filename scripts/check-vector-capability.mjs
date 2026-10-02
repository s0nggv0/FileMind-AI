import nextEnv from "@next/env";
import { Client } from "pg";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { databasePathMatches, parsePostmasterPid } from "./portable-paths.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const report = { checkedAt: new Date().toISOString(), database: "filemind_ai", verifiedOwnInstance: false, vectorAvailable: false, vectorEnabled: false, backend: "PortableVectorStore", error: null };
let client;
try {
  const uri = new URL(process.env.DATABASE_URL);
  const metadata = JSON.parse(await readFile(".filemind/postgresql/instance.json", "utf8"));
  if (uri.hostname !== "127.0.0.1" || uri.username !== "filemind_user" || uri.pathname !== "/filemind_ai" || Number(uri.port) !== metadata.port) throw new Error("OWN_INSTANCE_NOT_VERIFIED");
  client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  await client.connect();
  const local = parsePostmasterPid(await readFile(".filemind/postgresql/data/postmaster.pid"));
  // pg_read_binary_file is reserved to the private administrator; verify instance
  // using the launcher's pinned port and local PID path, without using another DB.
  if (!databasePathMatches(local.directory, resolve(".filemind/postgresql/data"))) throw new Error("OWN_INSTANCE_NOT_VERIFIED");
  const result = await client.query("select current_database() as database, exists(select 1 from pg_available_extensions where name='vector') as available, exists(select 1 from pg_extension where extname='vector') as enabled");
  if (result.rows[0].database !== "filemind_ai") throw new Error("OWN_INSTANCE_NOT_VERIFIED");
  report.verifiedOwnInstance = true;
  report.vectorAvailable = result.rows[0].available;
  if (report.vectorAvailable) {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    report.vectorEnabled = true;
  }
  // Phase 5 chooses portable arrays for a copyable runtime, even if the extension
  // is available. An enabled extension alone does not implement PgVectorStore.
} catch { report.error = "PREFLIGHT_UNAVAILABLE"; process.exitCode = 1; }
finally { await client?.end(); }
await writeFile("docs/phase-checklists/vector-capability.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
