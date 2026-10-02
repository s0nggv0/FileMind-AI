import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function applyMigrations(client, directory = join(process.cwd(), "database/migrations")) {
  const applied = [];
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(647310042)");
    await client.query("create schema if not exists filemind");
    await client.query("create table if not exists filemind.schema_migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now())");
    const files = (await readdir(directory)).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
    if (!files.length) throw new Error("No database migrations found");
    for (const name of files) {
      const sql = (await readFile(join(directory, name), "utf8")).replaceAll("\r\n", "\n");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query("select checksum from filemind.schema_migrations where name=$1", [name]);
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum) throw new Error("Previously applied migration has changed");
        continue;
      }
      await client.query(sql);
      await client.query("insert into filemind.schema_migrations(name,checksum) values($1,$2)", [name, checksum]);
      applied.push(name);
    }
    await client.query("commit");
    return applied;
  } catch (error) { await client.query("rollback").catch(() => {}); throw error; }
}

async function main() {
  const { default: nextEnv } = await import("@next/env");
  nextEnv.loadEnvConfig(process.cwd());
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is missing");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error("Invalid DATABASE_URL");
  const { Client } = await import("pg");
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 45_000, application_name: "filemind-migration" });
  try {
    await client.connect();
    const applied = await applyMigrations(client);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Database migration failed. Check DATABASE_URL, database permissions and migration history. Connection details are not printed.");
    process.exitCode = 1;
  });
}
