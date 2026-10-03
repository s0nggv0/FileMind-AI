import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { startupRecovery } from "./startup-recovery.mjs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { access, mkdir, readFile, writeFile, unlink, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "./migrate-database.mjs";
import { databasePathMatches, parsePostmasterPid } from "./portable-paths.mjs";

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const privateRoot = join(root, ".filemind");
const pgRoot = join(privateRoot, "postgresql");
const data = join(pgRoot, "data");
const bin = join(pgRoot, "runtime/pgsql/bin");
const log = join(privateRoot, "logs/postgresql.log");
const envPath = join(root, ".env.local");
const metadataPath = join(pgRoot, "instance.json");
const adminPath = join(pgRoot, "admin.password");
const lockPath = join(privateRoot, "launcher.lock");
const stopPath = join(privateRoot, "stop.request");
const serverPath = join(root, ".next/standalone/server.js");
const args = process.argv.slice(2);
const exists = path => access(path).then(() => true, () => false);
const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
let metadata; let adminPassword; let startedDatabase = false; let web; let locked = false; let closing; let stopTimer;

function run(executable, arguments_, label, allowFailure = false) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, arguments_, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", bytes => { output += bytes; });
    child.stderr.on("data", bytes => { output += bytes; });
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`${label} timed out. Check .filemind/logs/postgresql.log.`)); }, 60_000);
    child.on("error", () => { clearTimeout(timeout); reject(new Error(`${label} could not run.`)); });
    child.on("exit", code => {
      clearTimeout(timeout);
      if (code !== 0 && !allowFailure) reject(new Error(`${label} failed. Check .filemind/logs/postgresql.log.`));
      else resolveRun({ code, output });
    });
  });
}

async function availablePort(preferred) {
  const attempt = port => new Promise((resolvePort, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(port, "127.0.0.1", () => {
      const result = socket.address().port;
      socket.close(error => error ? reject(error) : resolvePort(result));
    });
  });
  try { return await attempt(preferred); } catch { return attempt(0); }
}

async function acquireLock() {
  try {
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, root }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const previous = JSON.parse(await readFile(lockPath, "utf8"));
    if (!samePath(previous.root, root)) throw new Error("This folder was copied while FileMind was running. Stop the source, then copy again.");
    let alive = true;
    try { process.kill(previous.pid, 0); } catch (failure) { if (failure.code === "ESRCH") alive = false; }
    if (alive) throw new Error("FileMind already has a running launcher in this folder.");
    await unlink(lockPath);
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, root }), { flag: "wx", mode: 0o600 });
  }
  locked = true;
}

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    return match ? [[match[1], match[2].trim().replace(/^(["'])(.*)\1$/, "$2")]] : [];
  }));
}

async function prepareDatabase() {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("This bundled runtime requires Windows x64.");
  for (const path of [serverPath, join(bin, "postgres.exe"), join(bin, "pg_ctl.exe"), join(bin, "initdb.exe")]) {
    if (!(await exists(path))) throw new Error("Portable runtime or build is missing. Copy the entire prepared folder, including .filemind and .next.");
  }
  await mkdir(join(privateRoot, "logs"), { recursive: true });
  await acquireLock();
  await unlink(stopPath).catch(() => {});
  const initialized = await exists(join(data, "PG_VERSION"));
  if (initialized && (!(await exists(metadataPath)) || !(await exists(adminPath)) || !(await exists(envPath)))) {
    throw new Error("Existing database credentials are missing. Restore the complete folder; existing data was preserved.");
  }
  if (!(await exists(metadataPath))) {
    metadata = { version: 1, instanceId: randomUUID(), port: 55433 };
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), { flag: "wx", mode: 0o600 });
  } else metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  if (metadata.version !== 1 || !Number.isInteger(metadata.port) || metadata.port < 1024 || metadata.port > 65535) throw new Error("Portable database metadata is invalid.");
  if (!(await exists(adminPath))) await writeFile(adminPath, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
  adminPassword = (await readFile(adminPath, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/.test(adminPassword)) throw new Error("Portable database administrator credential is invalid.");
  if (!(await exists(envPath))) {
    const template = await readFile(join(root, ".env.example"), "utf8");
    const initial = template
      .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=postgresql://filemind_user:${randomBytes(32).toString("hex")}@127.0.0.1:${metadata.port}/filemind_ai`)
      .replace(/^WORKSPACE_SESSION_SECRET=.*$/m, `WORKSPACE_SESSION_SECRET=${randomBytes(32).toString("hex")}`)
      .replace(/^WORKSPACE_COOKIE_SECURE=.*$/m, "WORKSPACE_COOKIE_SECURE=false");
    await writeFile(envPath, initial, { flag: "wx", mode: 0o600 });
  }
  let envText = await readFile(envPath, "utf8");
  let config = parseEnv(envText);
  const uri = new URL(config.DATABASE_URL);
  if (uri.protocol !== "postgresql:" || uri.hostname !== "127.0.0.1" || uri.username !== "filemind_user" || uri.pathname !== "/filemind_ai" || !/^[a-f0-9]{64}$/.test(uri.password)) {
    throw new Error("Portable DATABASE_URL must use this folder's dedicated FileMind database.");
  }
  if (!config.WORKSPACE_SESSION_SECRET || Buffer.byteLength(config.WORKSPACE_SESSION_SECRET) < 32) throw new Error("Workspace identity credential is missing or invalid.");
  const pgRequire = createRequire(serverPath);
  const { Client, Pool } = pgRequire("pg");
  const admin = database => new Client({ host: "127.0.0.1", port: metadata.port, user: "filemind_admin", password: adminPassword, database, connectionTimeoutMillis: 5000 });
  if (!initialized) {
    console.log("Initializing this folder's private PostgreSQL database...");
    await run(join(bin, "initdb.exe"), ["-D", data, "-U", "filemind_admin", "--encoding=UTF8", "--locale=C", "--auth=scram-sha-256", `--pwfile=${adminPath}`], "Database initialization");
  }
  let running = false;
  if (await exists(join(data, "postmaster.pid"))) {
    const recorded = parsePostmasterPid(await readFile(join(data, "postmaster.pid")));
    if (!databasePathMatches(recorded.directory, data)) throw new Error("The database was copied while running. Stop the source database before copying the folder.");
    const state = await run(join(bin, "pg_ctl.exe"), ["status", "-D", data], "Database status", true);
    if (state.code === 0) {
      const client = admin("postgres");
      try {
        await client.connect();
        const result = await client.query("select pg_read_binary_file('postmaster.pid') as pid_bytes");
        const connected = parsePostmasterPid(result.rows[0].pid_bytes);
        running = connected.pid === recorded.pid && databasePathMatches(connected.directory, data);
      } catch { throw new Error("An existing database process could not be verified; it was left untouched."); }
      finally { await client.end(); }
      if (!running) throw new Error("The database port belongs to another folder; that process was left untouched.");
      startedDatabase = true;
    } else {
      const pid = recorded.pid;
      let alive = true;
      try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") alive = false; }
      if (alive) throw new Error("A stale database PID matches another process. Stop and inspect it before continuing.");
      await unlink(join(data, "postmaster.pid"));
    }
  }
  if (!running) {
    metadata.port = await availablePort(metadata.port);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
    await run(join(bin, "pg_ctl.exe"), ["start", "-D", data, "-l", log, "-w", "-t", "30", "-o", `-h 127.0.0.1 -p ${metadata.port}`], "Database startup");
    startedDatabase = true;
  }
  uri.port = String(metadata.port);
  envText = envText.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${uri.href}`);
  await writeFile(envPath, envText, { mode: 0o600 });
  config = parseEnv(envText);
  const administrator = admin("postgres");
  try {
    await administrator.connect();
    const role = await administrator.query("select rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls from pg_roles where rolname='filemind_user'");
    if (!role.rows.length) {
      await administrator.query(`create role filemind_user login nosuperuser nocreatedb nocreaterole nobypassrls password '${uri.password}'`);
    } else if (role.rows[0].rolsuper || role.rows[0].rolcreatedb || role.rows[0].rolcreaterole || role.rows[0].rolbypassrls) throw new Error("FileMind application role has unexpected elevated permissions.");
    const database = await administrator.query("select pg_get_userbyid(datdba) as owner from pg_database where datname='filemind_ai'");
    if (!database.rows.length) await administrator.query("create database filemind_ai owner filemind_user");
    else if (database.rows[0].owner !== "filemind_user") throw new Error("FileMind database has an unexpected owner.");
    await administrator.query("revoke all on database filemind_ai from public");
  } catch (error) {
    if (error.message?.startsWith("FileMind")) throw error;
    throw new Error("Could not prepare the dedicated FileMind database. Credentials were not printed.");
  } finally { await administrator.end(); }
  const application = new Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 45_000 });
  try {
    await application.connect();
    const applied = await applyMigrations(application, join(root, "database/migrations"));
    console.log(applied.length ? "FileMind database tables initialized." : "FileMind database is up to date.");
  } catch { throw new Error("FileMind migration failed. Existing data and credentials were preserved."); }
  finally { await application.end(); }
  const storage = resolve(root, config.FILE_STORAGE_ROOT || ".filemind/storage");
  if (!samePath(storage, join(privateRoot, "storage"))) throw new Error("Portable storage must remain inside .filemind/storage.");
  await mkdir(storage, { recursive: true, mode: 0o700 });
  const recoveryAdministrator = admin("filemind_ai");
  try {
    await recoveryAdministrator.connect();
    // Only this local launcher holds administrator credentials. Repair itself
    // always runs through application-role tenant transactions and FORCE RLS.
    const owners = (await recoveryAdministrator.query("select distinct user_id from filemind.operation_journal where status in ('pending','running','interrupted') or (status='committed' and stage<>'settled' and (payload ? 'stagingId' or payload ? 'buildId' or payload ? 'removedFiles'))")).rows.map(row => row.user_id);
    const repaired = await startupRecovery(owners, Pool, config.DATABASE_URL, storage);
    console.log(`FileMind startup recovery: ${repaired.recovered} repaired, ${repaired.active} active operations preserved.`);
  } catch { throw new Error("FileMind recovery needs attention. Existing data was preserved; retry startup or use Maintenance."); }
  finally { await recoveryAdministrator.end(); }
  Object.assign(process.env, config, {
    NODE_ENV: "production", FILE_STORAGE_ROOT: storage, WORKSPACE_COOKIE_SECURE: "false",
    AI_ENGINE: !args.includes("--mock") && config.KIMI_API_KEY?.trim() ? "llm" : "mock",
  });
  console.log(`Private database ready on 127.0.0.1:${metadata.port}. Kimi key ${config.KIMI_API_KEY?.trim() ? "configured" : "not configured; using Mock"}.`);
}

function shutdown() {
  if (closing) return closing;
  closing = (async () => {
    clearInterval(stopTimer);
    if (web && web.exitCode === null) {
      web.kill();
      await new Promise(resolveExit => { web.once("exit", resolveExit); setTimeout(resolveExit, 5000).unref(); });
    }
    if (startedDatabase) {
      await run(join(bin, "pg_ctl.exe"), ["stop", "-D", data, "-m", "fast", "-w", "-t", "30"], "Database shutdown").catch(error => { console.error(error.message); process.exitCode = 1; });
    }
    if (locked) await unlink(lockPath).catch(() => {});
    await unlink(stopPath).catch(() => {});
  })();
  return closing;
}

async function requestStop() {
  if (await exists(lockPath)) {
    const owner = JSON.parse(await readFile(lockPath, "utf8"));
    if (!samePath(owner.root, root)) throw new Error("Stop the source folder before making a copy.");
    let alive = true;
    try { process.kill(owner.pid, 0); } catch (error) { if (error.code === "ESRCH") alive = false; }
    if (alive) {
      await writeFile(stopPath, "stop", { mode: 0o600 });
      for (let attempt = 0; attempt < 80; attempt++) {
        if (!(await exists(lockPath))) { console.log("FileMind website and database stopped."); return; }
        await new Promise(resolveWait => setTimeout(resolveWait, 500));
      }
      throw new Error("FileMind has not stopped yet; check the startup window before copying.");
    }
  }
  if (await exists(join(data, "postmaster.pid"))) {
    const recorded = parsePostmasterPid(await readFile(join(data, "postmaster.pid")));
    if (!databasePathMatches(recorded.directory, data)) throw new Error("This is a copy of a running database. Stop the source folder before copying.");
    const local = JSON.parse(await readFile(metadataPath, "utf8"));
    const password = (await readFile(adminPath, "utf8")).trim();
    const { Client } = createRequire(serverPath)("pg");
    const client = new Client({ host: "127.0.0.1", port: local.port, database: "postgres", user: "filemind_admin", password, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      const result = await client.query("select pg_read_binary_file('postmaster.pid') as pid_bytes");
      const connected = parsePostmasterPid(result.rows[0].pid_bytes);
      if (connected.pid !== recorded.pid || !databasePathMatches(connected.directory, data)) throw new Error("Database process belongs to another folder.");
    } catch { throw new Error("The database process could not be verified; it was left untouched."); }
    finally { await client.end(); }
    await run(join(bin, "pg_ctl.exe"), ["stop", "-D", data, "-m", "fast", "-w", "-t", "30"], "Database shutdown");
  }
  await unlink(lockPath).catch(() => {});
  await unlink(stopPath).catch(() => {});
  console.log("FileMind database stopped.");
}

for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(signal, () => { void shutdown().then(() => process.exit(0)); });
try {
  if (args.includes("--stop")) await requestStop();
  else {
    await prepareDatabase();
    if (!args.includes("--prepare-only")) {
      const requested = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 3000;
      if (!Number.isInteger(requested) || requested < 1024 || requested > 65535) throw new Error("Invalid website port.");
      const port = await availablePort(requested);
      console.log(`FileMind: http://127.0.0.1:${port}`);
      console.log("Configure Kimi and Embedding separately in .env.local. Press Ctrl+C to stop before copying this folder.");
      stopTimer = setInterval(() => { void exists(stopPath).then(stopping => { if (stopping) void shutdown().then(() => process.exit(0)); }); }, 500);
      web = spawn(process.execPath, [serverPath], { cwd: root, env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", WORKSPACE_ORIGIN: `http://127.0.0.1:${port}` }, windowsHide: true, stdio: "inherit" });
      await new Promise((resolveExit, reject) => {
        web.once("error", () => reject(new Error("Website could not start.")));
        web.once("exit", code => code === 0 || closing ? resolveExit() : reject(new Error("Website stopped unexpectedly.")));
      });
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Portable startup failed.");
  process.exitCode = 1;
} finally { await shutdown(); }
