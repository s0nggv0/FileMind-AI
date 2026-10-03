export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL?.trim()) {
    const { database } = await import("./lib/server/database");
    // Do not enumerate other owners from the Web role. Portable startup repairs
    // globally; dev/ordinary server repairs the authenticated tenant on access.
    try { await database.query(crypto.randomUUID(), "select id from filemind.operation_journal limit 0"); }
    catch { console.warn("FileMind storage is unavailable or migrations are pending. Requests will show a recoverable error."); }
  }
}
