import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export const cookieName = "parkly_auth";
export function authService(db) {
  const publicUser = async (user) =>
    user && {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      roles: (
        await db.query("SELECT role FROM user_roles WHERE user_id=$1", [
          user.id,
        ])
      ).map((r) => r.role),
    };
  async function issue(user) {
    const token = randomBytes(32).toString("hex");
    await db.query("DELETE FROM sessions WHERE expires_at < $1", [
      new Date().toISOString(),
    ]);
    await db.query(
      "INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,$3)",
      [
        digest(token),
        user.id,
        new Date(Date.now() + 7 * 86400000).toISOString(),
      ],
    );
    return { token, user: await publicUser(user) };
  }
  return {
    publicUser,
    async register({ name, email, password, role }) {
      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.length > 80 ||
        typeof email !== "string" ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof password !== "string" ||
        password.length < 12 ||
        password.length > 128 ||
        !["driver", "host"].includes(role)
      )
        throw fail(
          "Enter your name, a valid email, a password of 12–128 characters, and a driver or host role.",
        );
      email = email.trim().toLowerCase();
      const salt = randomBytes(16).toString("hex");
      const hash = (await scrypt(password, salt, 64)).toString("hex");
      const user = {
        id: randomUUID(),
        name: name.trim(),
        email,
        status: "active",
      };
      try {
        await db.query(
          "INSERT INTO users(id,name,email,password_hash,created_at) VALUES($1,$2,$3,$4,$5)",
          [
            user.id,
            user.name,
            email,
            `${salt}:${hash}`,
            new Date().toISOString(),
          ],
        );
      } catch (e) {
        if (e.code === "23505" || e.code?.startsWith("SQLITE_CONSTRAINT"))
          throw fail(
            "Unable to create this account. Try signing in instead.",
            409,
          );
        throw e;
      }
      await db.query(
        "INSERT INTO user_roles(user_id,role) VALUES($1,'driver')",
        [user.id],
      );
      if (role === "host")
        await db.query(
          "INSERT INTO user_roles(user_id,role) VALUES($1,'host')",
          [user.id],
        );
      return issue(user);
    },
    async login({ email, password }) {
      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        password.length > 128
      )
        throw fail("Email or password is incorrect.", 401);
      const user = (
        await db.query("SELECT * FROM users WHERE email=$1", [
          email.trim().toLowerCase(),
        ])
      )[0];
      const [salt, stored] = (
        user?.password_hash ||
        "00000000000000000000000000000000:" + "0".repeat(128)
      ).split(":");
      const result = await scrypt(password, salt, 64);
      if (
        !timingSafeEqual(result, Buffer.from(stored, "hex")) ||
        !user ||
        user.status !== "active"
      )
        throw fail("Email or password is incorrect.", 401);
      return issue(user);
    },
    async resolve(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      const user = (
        await db.query(
          "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=$1 AND s.expires_at>$2 AND u.status='active'",
          [digest(token), new Date().toISOString()],
        )
      )[0];
      return publicUser(user);
    },
    async logout(token) {
      if (token)
        await db.query("DELETE FROM sessions WHERE id=$1", [digest(token)]);
    },
  };
}
export { fail };
