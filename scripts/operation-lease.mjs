export function createOperationLease(pool) {
  return async (key, work, tryOnly = false) => {
    const client = await pool.connect();
    const lease = new AbortController(); let locked = false;
    const interrupted = () => lease.abort(new Error("Operation lease interrupted."));
    client.on("error", interrupted);
    try {
      const result = await client.query(tryOnly ? "select pg_try_advisory_lock(hashtextextended($1,8808)) as locked" : "select pg_advisory_lock(hashtextextended($1,8808))", [key]);
      locked = !tryOnly || result.rows[0].locked;
      if (!locked) return null;
      lease.signal.throwIfAborted();
      return await work(lease.signal);
    } finally {
      if (locked) await client.query("select pg_advisory_unlock(hashtextextended($1,8808))", [key]).catch(() => {});
      client.removeListener("error", interrupted);
      // Never reuse a physical session whose unlock acknowledgement is uncertain.
      client.release(true);
    }
  };
}
