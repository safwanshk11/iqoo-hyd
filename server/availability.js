import { randomUUID } from "node:crypto";
import { database } from "./database.js";
import { fail } from "./auth.js";
export async function inventoryTransaction(store, fn) {
  const client = store.pool ? await store.pool.connect() : null;
  const db = client
    ? { query: async (sql, args) => (await client.query(sql, args)).rows }
    : database(store);
  try {
    if (client) {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('parkly-inventory',0))",
      );
    } else store.db.exec("BEGIN IMMEDIATE");
    const result = await fn(db);
    if (client) await client.query("COMMIT");
    else store.db.exec("COMMIT");
    return result;
  } catch (e) {
    if (client) await client.query("ROLLBACK");
    else store.db.exec("ROLLBACK");
    throw e;
  } finally {
    client?.release();
  }
}

export async function blockSpace(store, owner, id, start, end) {
  return inventoryTransaction(store, async (db) => {
    const space = (
      await db.query("SELECT id FROM spaces WHERE id=$1 AND owner=$2", [
        id,
        owner,
      ])
    )[0];
    if (!space) throw fail("Space not found.", 404);
    const sc = store.pool ? "start_time" : "start",
      ec = store.pool ? "end_time" : "end";
    const reserved = await db.query(
      `SELECT id FROM bookings WHERE space_id=$1 AND status<>'cancelled' AND ${sc}<$2 AND ${ec}>$3 UNION ALL SELECT id FROM allocations WHERE space_id=$1 AND ${sc}<$2 AND ${ec}>$3`,
      [id, end, start],
    );
    if (reserved.length)
      throw fail(
        "This period already has reservations. Choose another period.",
        409,
      );
    const blockId = randomUUID();
    await db.query(
      "INSERT INTO space_blocks(id,space_id,start_time,end_time) VALUES($1,$2,$3,$4)",
      [blockId, id, start, end],
    );
    return { id: blockId };
  });
}
