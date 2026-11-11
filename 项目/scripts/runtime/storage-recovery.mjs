import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const extensions = new Set(["pdf", "docx", "txt", "md", "png", "jpg", "jpeg"]);
export function originalKey(userId, workspaceId, documentId, extension) {
  if (![userId, workspaceId, documentId].every(id => uuid.test(id)) || !extensions.has(extension)) throw new Error("INVALID_STORAGE_INTENT");
  return `${userId}/${workspaceId}/${documentId}/original.${extension}`;
}
function contained(root, target) {
  const within = relative(resolve(root), resolve(target));
  return within === "" || (!within.startsWith("..") && !isAbsolute(within));
}
async function info(path) {
  return lstat(path).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
}
async function atomicJSON(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(JSON.stringify(value) + "\n"); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}
async function hashFile(path) {
  const digest = createHash("sha256");
  for await (const part of createReadStream(path)) digest.update(part);
  return digest.digest("hex");
}
export async function ensureStorageDirectory(path) {
  const resolved = resolve(path);
  // Check ancestors before creating children: recursive mkdir could otherwise
  // follow an existing junction and create directories outside private storage.
  let current = parse(resolved).root;
  for (const part of relative(current, resolved).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    if (!await info(current)) await mkdir(current, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
    const entry = await lstat(current);
    if (!entry.isDirectory() || entry.isSymbolicLink() || resolve(await realpath(current)).toLowerCase() !== current.toLowerCase()) throw new Error("UNSAFE_STORAGE_ROOT");
  }
  return resolved;
}
const safeRoot = ensureStorageDirectory;
async function safeExisting(root, key) {
  if (typeof key !== "string" || key.includes("\\") || key.split("/").some(part => !part || part === "." || part === "..")) throw new Error("UNSAFE_STORAGE_PATH");
  const target = resolve(root, ...key.split("/"));
  if (!contained(root, target) || target === root) throw new Error("UNSAFE_STORAGE_PATH");
  const entry = await info(target);
  if (!entry) return null;
  if (entry.isSymbolicLink() || !contained(root, await realpath(target))) throw new Error("UNSAFE_STORAGE_PATH");
  let parent = dirname(target);
  while (parent !== root) {
    const parentInfo = await lstat(parent);
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) throw new Error("UNSAFE_STORAGE_PATH");
    parent = dirname(parent);
  }
  return { path: target, entry };
}
async function referenced(query, userId, key) {
  return (await query(userId, "select id from filemind.documents where user_id=$1 and (storage_path=$2 or starts_with(storage_path,$2||'/')) limit 1", [userId, key])).rows.length > 0;
}
function quarantinePath(root, options) {
  // Runtime private data must never become a build-time traced dependency.
  const destination = resolve(/* turbopackIgnore: true */ options.quarantineRoot ?? join(/* turbopackIgnore: true */ dirname(root), "quarantine"));
  if (contained(root, destination) || contained(destination, root)) throw new Error("INVALID_QUARANTINE_ROOT");
  return destination;
}
export async function quarantineStorage(query, userId, key, reason, options) {
  if (!uuid.test(userId) || !/^[a-z][a-z0-9_]{0,59}$/.test(reason)) throw new Error("INVALID_QUARANTINE_INTENT");
  options.signal?.throwIfAborted();
  const root = await safeRoot(options.storageRoot);
  const allowed = key.startsWith(`${userId}/`) || /^\.(imports|indexes)\//.test(key) && key.split("/")[1] === userId;
  if (!allowed) throw new Error("FOREIGN_STORAGE_INTENT");
  const original = await safeExisting(root, key);
  if (!original) return null;
  if (await referenced(query, userId, key)) return null;
  const quarantineRoot = await safeRoot(quarantinePath(root, options));
  const ownerRoot = await safeRoot(join(quarantineRoot, userId));
  const id = randomUUID(), directory = join(ownerRoot, id);
  await mkdir(directory, { mode: 0o700 });
  const hash = original.entry.isFile() ? await hashFile(original.path) : null;
  const manifest = { version: 1, id, userId, origin: key, reason, kind: original.entry.isDirectory() ? "directory" : "file", sha256: hash, state: "planned", createdAt: new Date().toISOString() };
  await atomicJSON(join(directory, "manifest.json"), manifest);
  await options.onQuarantineIntent?.(id);
  options.signal?.throwIfAborted();
  // Recheck immediately before the move while the caller holds this owner's
  // storage/index lease. A referenced original is never quarantined.
  if (await referenced(query, userId, key)) { await atomicJSON(join(directory, "manifest.json"), { ...manifest, state: "cancelled" }); return null; }
  if (!await safeExisting(root, key)) return null;
  await rename(original.path, join(directory, "bytes"));
  await atomicJSON(join(directory, "manifest.json"), { ...manifest, state: "quarantined" });
  return id;
}
export async function repairQuarantineIntents(query, userId, options) {
  if (!uuid.test(userId)) throw new Error("INVALID_OWNER");
  const root = await safeRoot(options.storageRoot);
  const quarantineRoot = await safeRoot(quarantinePath(root, options));
  const owner = join(quarantineRoot, userId), ownerInfo = await info(owner);
  if (!ownerInfo) return 0;
  await safeExisting(quarantineRoot, userId);
  let repaired = 0;
  for (const name of await readdir(owner)) {
    if (!uuid.test(name)) continue;
    options.signal?.throwIfAborted();
    const directory = join(owner, name);
    await safeExisting(owner, name);
    const manifestPath = join(directory, "manifest.json"), manifestInfo = await info(manifestPath);
    if (!manifestInfo?.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size > 16384) continue;
    let manifest; try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch { continue; }
    if (manifest.version !== 1 || manifest.id !== name || manifest.userId !== userId || manifest.state !== "planned") continue;
    const key = manifest.origin;
    if (typeof key !== "string" || !(key.startsWith(`${userId}/`) || /^\.(imports|indexes)\//.test(key) && key.split("/")[1] === userId)) throw new Error("FOREIGN_QUARANTINE_INTENT");
    const bytesPath = join(directory, "bytes");
    const bytes = await safeExisting(directory, "bytes");
    const original = await safeExisting(root, key);
    if (bytes && !original) {
      if (bytes.entry.isFile() && manifest.sha256 && await hashFile(bytesPath) !== manifest.sha256) throw new Error("QUARANTINE_INTEGRITY");
      await atomicJSON(manifestPath, { ...manifest, state: "quarantined" }); repaired++;
    } else if (original && !bytes) {
      if (await referenced(query, userId, key)) { await atomicJSON(manifestPath, { ...manifest, state: "cancelled" }); continue; }
      if (original.entry.isFile() && manifest.sha256 && await hashFile(original.path) !== manifest.sha256) throw new Error("QUARANTINE_INTEGRITY");
      options.signal?.throwIfAborted();
      await rename(original.path, bytesPath);
      await atomicJSON(manifestPath, { ...manifest, state: "quarantined" }); repaired++;
    } else if (!original && !bytes) {
      await atomicJSON(manifestPath, { ...manifest, state: "unavailable" }); repaired++;
    }
  }
  return repaired;
}
export async function repairOperationFiles(query, row, options) {
  if (!uuid.test(row.user_id)) throw new Error("INVALID_OWNER");
  const ids = [];
  // Original removal publishes metadata first. Only COMMITTED removals may
  // quarantine bytes; aborted removals retain their original and parsed content.
  if (row.status === "committed") for (const file of row.payload.removedFiles ?? []) {
    const key = originalKey(row.user_id, file.workspaceId, file.documentId, file.extension);
    const id = await quarantineStorage(query, row.user_id, key, "committed_removal", options);
    if (id) ids.push(id);
  }
  for (const file of row.payload.files ?? []) {
    if (!file.newlyPublished) continue;
    const key = originalKey(row.user_id, file.workspaceId, file.documentId, file.extension);
    const id = await quarantineStorage(query, row.user_id, key, "interrupted_publication", options);
    if (id) ids.push(id);
  }
  for (const [folder, field] of [[".imports", "stagingId"], [".indexes", "buildId"]]) {
    const id = row.payload[field];
    if (id && uuid.test(id)) {
      const quarantined = await quarantineStorage(query, row.user_id, `${folder}/${row.user_id}/${id}`, "interrupted_staging", options);
      if (quarantined) ids.push(quarantined);
    }
  }
  await repairQuarantineIntents(query, row.user_id, options);
  return ids;
}

// Both the launcher and the Web server use this protocol. The caller supplies
// physical PostgreSQL session leases; PID/age are never used to steal a lock.
export async function recoverTenantOperations(query, withLease, userId, options) {
  if (!uuid.test(userId)) throw new Error("INVALID_OWNER");
  const rows = (await query(userId, "select * from filemind.operation_journal where user_id=$1 and ((status in ('pending','running','interrupted') and stage<>'recovered') or (status='committed' and stage<>'settled' and (payload ? 'stagingId' or payload ? 'buildId' or payload ? 'removedFiles'))) order by started_at", [userId])).rows;
  const result = { recovered: 0, active: 0, quarantineIds: [] };
  for (const snapshot of rows) {
    // Runtime indexing must not cancel work queued by a live application.
    // Startup recovery includes queued jobs before accepting any Web requests.
    if (!uuid.test(snapshot.id) || snapshot.user_id !== userId || !(snapshot.lock_key === "storage" || [ `index:${snapshot.resource_id}`, `prepare:${snapshot.resource_id}` ].includes(snapshot.lock_key) && uuid.test(snapshot.resource_id))) throw new Error("INVALID_JOURNAL_LOCK");
    if (options.skipQueued && snapshot.status === "pending" && snapshot.stage === "queued") continue;
    const acquired = await withLease(`${userId}:${snapshot.lock_key}`, async signal => {
      signal.throwIfAborted();
      const row = (await query(userId, "select * from filemind.operation_journal where user_id=$1 and id=$2", [userId, snapshot.id])).rows[0];
      if (!row || ["settled", "recovered", "rolled_back"].includes(row.stage)) return true;
      const payload = row.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || [payload.files,payload.removedFiles].some(files=>files && (!Array.isArray(files) || files.length > 2000))) throw new Error("INVALID_JOURNAL_PAYLOAD");
      // Record takeover before moving anything. COMMITTED operations retain
      // their status; reference checks preserve all committed originals.
      if (row.status !== "committed") await query(userId, "update filemind.operation_journal set status='interrupted',stage='recovering',updated_at=now(),error_code='PROCESS_INTERRUPTED' where user_id=$1 and id=$2 and status<>'committed'", [userId, row.id]);
      const ids = [...(payload.quarantineIds ?? [])];
      const moved = await repairOperationFiles(query, row, { ...options, signal, onQuarantineIntent: async id => {
        if (!ids.includes(id)) ids.push(id);
        await query(userId, "update filemind.operation_journal set payload=jsonb_set(payload,'{quarantineIds}',$3::jsonb),updated_at=now() where user_id=$1 and id=$2", [userId, row.id, JSON.stringify(ids)]);
      } });
      signal.throwIfAborted();
      if (row.operation_type === "reindex" && row.status !== "committed") await query(userId, "update filemind.documents set index_build_status='interrupted',index_build_error_code='PROCESS_INTERRUPTED' where user_id=$1 and id=$2 and index_build_id=$3", [userId, row.resource_id, row.id]);
      await query(userId, "update filemind.operation_journal set stage=$3,completed_at=coalesce(completed_at,now()),updated_at=now() where user_id=$1 and id=$2", [userId, row.id, row.status === "committed" ? "settled" : "recovered"]);
      result.quarantineIds.push(...moved); result.recovered++; return true;
    }, true);
    if (acquired === null) result.active++;
  }
  return result;
}
export async function reconcileStorage(query, userId, options) {
  if (!uuid.test(userId)) throw new Error("INVALID_OWNER");
  const root = await safeRoot(options.storageRoot);
  const result = { referenced: 0, orphan: 0, missing: 0, notStored: 0, unsafe: 0, quarantineIds: [], repairedIntents: await repairQuarantineIntents(query, userId, options) };
  const documents = (await query(userId, "select id,workspace_id,storage_path,content_hash,file_size from filemind.documents where user_id=$1", [userId])).rows;
  const references = new Set();
  for (const document of documents) {
    options.signal?.throwIfAborted();
    if (document.storage_path === null) {
      result.notStored++; await query(userId, "update filemind.documents set storage_status='not_stored' where user_id=$1 and id=$2", [userId, document.id]); continue;
    }
    const extension = String(document.storage_path).split(".").at(-1);
    let existing; let valid = false;
    try {
      const expected = originalKey(userId, document.workspace_id, document.id, extension);
      if (document.storage_path !== expected) throw new Error("INVALID_REFERENCE");
      references.add(expected); existing = await safeExisting(root, expected);
      valid = Boolean(existing?.entry.isFile() && existing.entry.size === Number(document.file_size) && (!document.content_hash || await hashFile(existing.path) === document.content_hash));
    } catch { result.unsafe++; }
    if (valid) result.referenced++; else result.missing++;
    await query(userId, "update filemind.documents set storage_status=$3 where user_id=$1 and id=$2", [userId, document.id, valid ? "available" : "missing"]);
  }
  const owner = join(root, userId), ownerInfo = await info(owner);
  if (!ownerInfo) return result;
  await safeExisting(root, userId);
  async function walk(directory, depth) {
    if (depth > 5) throw new Error("STORAGE_SCAN_DEPTH");
    for (const name of await readdir(directory)) {
      options.signal?.throwIfAborted();
      const path = join(directory, name), key = relative(root, path).split("\\").join("/");
      const entry = await info(path); if (!entry) continue;
      if (entry.isSymbolicLink()) { result.unsafe++; continue; }
      await safeExisting(root, key);
      if (entry.isDirectory()) { await walk(path, depth + 1); continue; }
      if (references.has(key)) continue;
      result.orphan++;
      const id = await quarantineStorage(query, userId, key, "orphan_file", options);
      if (id) result.quarantineIds.push(id);
    }
  }
  await walk(owner, 0);
  return result;
}
