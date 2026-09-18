import "dotenv/config";
import { createStore } from "./store.js";
import { createNeonStore } from "./neon-store.js";
import { migrate } from "./database.js";
const email = process.argv[2]?.trim().toLowerCase();
if (!email)
  throw Error("Usage: node server/admin.js registered-admin@example.com");
const store = process.env.DATABASE_URL
  ? createNeonStore()
  : createStore("data/parkly.sqlite");
try {
  if (store.init) await store.init();
  const db = await migrate(store);
  const user = (
    await db.query("SELECT id FROM users WHERE email=$1 AND status='active'", [
      email,
    ])
  )[0];
  if (!user)
    throw Error(
      "Create and verify the intended account before granting administrator access.",
    );
  await db.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'admin') ON CONFLICT(user_id,role) DO NOTHING",
    [user.id],
  );
  console.log(
    "Administrator role granted. Sign in again to use the admin workspace.",
  );
} finally {
  if (store.pool) await store.pool.end();
  else store.db.close();
}
