import { resolve } from "node:path";

// Windows PostgreSQL can expose native-codepage path bytes even in a UTF-8 database.
// Accept a decoding only when it exactly matches the already resolved local directory.
export function databasePathMatches(bytes, expected) {
  for (const encoding of ["utf-8", "gb18030", "windows-1252", "windows-1251", "windows-1250", "big5", "shift_jis", "euc-kr"]) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      if (resolve(decoded).toLowerCase() === resolve(expected).toLowerCase()) return true;
    } catch {}
  }
  return false;
}

export function parsePostmasterPid(bytes) {
  const lines = bytes.toString("latin1").split(/\r?\n/);
  const pid = Number(lines[0]);
  if (!Number.isSafeInteger(pid) || pid <= 0 || !lines[1]) throw new Error("Database PID file is invalid.");
  return { pid, directory: Buffer.from(lines[1], "latin1") };
}
