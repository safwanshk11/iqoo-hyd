// One parameterized query interface for SQLite development and Neon production.
export function database(store) {
  if (store.pool)
    return {
      query: async (sql, params = []) =>
        (await store.pool.query(sql, params)).rows,
    };
  return {
    query: async (sql, params = []) => {
      const args = [];
      const statement = store.db.prepare(
        sql.replace(/\$(\d+)/g, (_, n) => {
          args.push(params[Number(n) - 1]);
          return "?";
        }),
      );
      return statement.reader
        ? statement.all(...args)
        : (statement.run(...args), []);
    },
  };
}

export async function migrate(store) {
  const db = database(store);
  const columns = {
    daily_rate: "INTEGER",
    monthly_rate: "INTEGER",
    status: "TEXT NOT NULL DEFAULT 'active'",
  };
  for (const [name, type] of Object.entries(columns)) {
    if (store.pool)
      await db.query(
        `ALTER TABLE spaces ADD COLUMN IF NOT EXISTS ${name} ${type}`,
      );
    else if (
      !store.db
        .prepare("PRAGMA table_info(spaces)")
        .all()
        .some((c) => c.name === name)
    )
      store.db.exec(`ALTER TABLE spaces ADD COLUMN ${name} ${type}`);
  }
  // Explicit starter rates for legacy demo inventory; hosts can edit these.
  await db.query(
    "UPDATE spaces SET daily_rate=price*8 WHERE daily_rate IS NULL",
  );
  await db.query(
    "UPDATE spaces SET monthly_rate=price*120 WHERE monthly_rate IS NULL",
  );
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS space_blocks (id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),start_time TEXT NOT NULL,end_time TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS user_roles (user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('driver','host','admin')), PRIMARY KEY(user_id,role))`,
    `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  ])
    await db.query(sql);
  return db;
}
