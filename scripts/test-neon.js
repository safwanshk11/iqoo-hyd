import "dotenv/config";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL)
  throw Error("DATABASE_URL is required for isolated Neon integration tests.");
const schema = "parkly_test_" + randomBytes(8).toString("hex");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(`CREATE SCHEMA ${schema}`);

  const child = spawn(process.execPath, ["--test", "tests/auth.test.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PARKLY_TEST_NEON_URL: process.env.DATABASE_URL,
      PARKLY_TEST_NEON_SCHEMA: schema,
    },
  });
  process.exitCode = await new Promise((resolve) => child.on("exit", resolve));
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
}
