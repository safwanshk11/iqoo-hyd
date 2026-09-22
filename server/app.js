import { blockSpace, inventoryTransaction } from "./availability.js";
import express from "express";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { migrate } from "./database.js";
import { authService, cookieName, fail } from "./auth.js";
import { quote } from "./pricing.js";

export async function createApp(store, options = {}) {
  const db = await migrate(store),
    auth = authService(db),
    app = express();
  const pg = !!store.pool,
    startColumn = pg ? "start_time" : "start",
    endColumn = pg ? "end_time" : "end";
  const bookingSelect = `SELECT b.*, b.${startColumn} AS start,b.${endColumn} AS end,s.name,s.area,s.address,s.instructions,s.lat,s.lng FROM bookings b JOIN spaces s ON s.id=b.space_id`;
  const allowed = new Set(
    (
      options.origins ||
      process.env.APP_ORIGINS ||
      "http://localhost:5173,http://127.0.0.1:5173,http://localhost,capacitor://localhost"
    ).split(","),
  );
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const route = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  const need = (role) => (req, res, next) =>
    !req.user
      ? next(fail("Sign in to continue.", 401))
      : role && !req.user.roles.includes(role)
        ? next(fail("This action is not available for your account.", 403))
        : next();
  const text = (v, max = 120) => {
    if (typeof v !== "string" || !v.trim() || v.length > max)
      throw fail("Complete the required fields.");
    return v.trim();
  };
  const windowValid = (start, end) => {
    if (
      !start ||
      !end ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(start) < Date.now() - 60000 ||
      Date.parse(end) <= Date.parse(start) ||
      Date.parse(end) - Date.parse(start) > 32 * 86400000
    )
      throw fail(
        "Choose a future arrival and later departure, up to 32 days apart.",
      );
  };
  const spaceInput = (b) => {
    if (
      !["Bike", "Hatchback", "Sedan", "SUV"].includes(b.vehicle) ||
      !Number.isInteger(b.capacity) ||
      b.capacity < 1 ||
      b.capacity > 100 ||
      !Number.isInteger(b.price) ||
      b.price < 1 ||
      b.price > 10000 ||
      !Number.isInteger(b.daily_rate) ||
      b.daily_rate < b.price ||
      b.daily_rate > b.price * 24 ||
      !Number.isInteger(b.monthly_rate) ||
      b.monthly_rate < b.daily_rate ||
      b.monthly_rate > 1000000 ||
      !Number.isFinite(b.lat) ||
      !Number.isFinite(b.lng) ||
      b.lat < 17 ||
      b.lat > 18 ||
      b.lng < 78 ||
      b.lng > 79
    )
      throw fail(
        "Check your rates, capacity, vehicle size and Hyderabad coordinates. Daily rates must be between one and 24 hourly rates.",
      );
    return {
      name: text(b.name),
      area: text(b.area),
      address: text(b.address),
      instructions: text(b.instructions, 1000),
      lat: b.lat,
      lng: b.lng,
      price: b.price,
      daily_rate: b.daily_rate,
      monthly_rate: b.monthly_rate,
      capacity: b.capacity,
      vehicle: b.vehicle,
      covered: pg ? !!b.covered : Number(!!b.covered),
      ev: pg ? !!b.ev : Number(!!b.ev),
    };
  };
  app.disable("x-powered-by");
  app.use(express.json({ limit: "50kb" }));
  app.use(
    "/api",
    route(async (req, res, next) => {
      res.set("Cache-Control", "no-store");
      const origin = req.get("Origin");
      const sameOrigin =
        origin &&
        ["http://", "https://"].some(
          (scheme) => origin === scheme + req.get("Host"),
        );
      if (origin && !allowed.has(origin) && !sameOrigin)
        throw fail("Origin is not allowed.", 403);
      if (origin && allowed.has(origin)) {
        res.set("Access-Control-Allow-Origin", origin);
        res.set("Vary", "Origin");
        res.set("Access-Control-Allow-Credentials", "true");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
      }
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      // Requiring JSON blocks cross-site HTML form submissions, including login CSRF.
      if (["POST", "PATCH"].includes(req.method) && !req.is("application/json"))
        throw fail("Use a JSON request.", 415);
      req.authToken = (req.headers.cookie || "")
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1);
      req.user = await auth.resolve(req.authToken);
      req.session = req.user?.id;
      next();
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, version: "0.4.2", auth: true }),
  );
  const attempts = new Map();
  const throttle = (req, _res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.until < now) attempts.delete(key);
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
    entry.count++;
    attempts.set(key, entry);
    next(
      entry.count > 30
        ? fail("Too many attempts. Try again in 15 minutes.", 429)
        : undefined,
    );
  };
  const setSession = (req, res, token) =>
    res.cookie(cookieName, token, {
      httpOnly: true,
      secure,
      sameSite: secure && allowed.has(req.get("Origin")) ? "none" : "lax",
      maxAge: 7 * 86400000,
      path: "/api",
    });
  for (const action of ["register", "login"])
    app.post(
      "/api/auth/" + action,
      throttle,
      route(async (req, res) => {
        const result = await auth[action](req.body);
        await auth.logout(req.authToken);
        setSession(req, res, result.token);
        res.json({ user: result.user });
      }),
    );
  app.get("/api/me", need(), (req, res) => res.json({ user: req.user }));
  app.post(
    "/api/auth/logout",
    route(async (req, res) => {
      await auth.logout(req.authToken);
      res.clearCookie(cookieName, {
        path: "/api",
        httpOnly: true,
        secure,
        sameSite: secure ? "none" : "lax",
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/auth/host",
    need(),
    route(async (req, res) => {
      await db.query(
        "INSERT INTO user_roles(user_id,role) VALUES($1,'host') ON CONFLICT(user_id,role) DO NOTHING",
        [req.user.id],
      );
      res.json({ user: await auth.publicUser(req.user) });
    }),
  );
  app.get(
    "/api/spaces",
    need("driver"),
    route(async (req, res) => {
      windowValid(req.query.start, req.query.end);
      const spaces = await db.query(
        "SELECT * FROM spaces WHERE status='active' ORDER BY id",
      );
      res.json(
        await Promise.all(
          spaces.map(async ({ owner, ...s }) => ({
            ...s,
            available: await store.available(
              s.id,
              req.query.start,
              req.query.end,
            ),
            quote: quote(s, req.query.start, req.query.end),
          })),
        ),
      );
    }),
  );
  app.post(
    "/api/spaces",
    need("host"),
    route(async (req, res) => {
      const data = spaceInput(req.body),
        id = randomUUID();
      const keys = ["id", "owner", ...Object.keys(data), "kind", "status"];
      await db.query(
        `INSERT INTO spaces(${keys.join(",")}) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
        [
          id,
          req.user.id,
          ...Object.values(data),
          "Private driveway",
          "pending_review",
        ],
      );
      res.json({ id, status: "pending_review" });
    }),
  );
  app.patch(
    "/api/host/spaces/:id",
    need("host"),
    route(async (req, res) => {
      await inventoryTransaction(store, async (db) => {
        const existing = (
          await db.query("SELECT * FROM spaces WHERE id=$1 AND owner=$2", [
            req.params.id,
            req.user.id,
          ])
        )[0];
        if (!existing) throw fail("Space not found.", 404);
        if (Object.keys(req.body).length === 1 && "status" in req.body) {
          if (!["paused", "pending_review"].includes(req.body.status))
            throw fail("Submit for review or pause your listing.");
          await db.query(
            "UPDATE spaces SET status=$1 WHERE id=$2 AND owner=$3",
            [req.body.status, existing.id, req.user.id],
          );
        } else {
          const data = spaceInput(req.body);
          // Existing reservations and allocations must retain their inventory.
          if (
            data.capacity !== existing.capacity ||
            data.vehicle !== existing.vehicle
          ) {
            const future = await db.query(
              `SELECT id FROM bookings WHERE space_id=$1 AND status<>'cancelled' AND ${endColumn}>$2 UNION ALL SELECT id FROM allocations WHERE space_id=$1 AND ${endColumn}>$2`,
              [existing.id, new Date().toISOString()],
            );
            if (future.length)
              throw fail(
                "Capacity and vehicle size cannot change while future reservations exist.",
                409,
              );
          }
          const keys = Object.keys(data);
          await db.query(
            `UPDATE spaces SET ${keys.map((k, i) => k + "=$" + (i + 1)).join(",")}, status='pending_review' WHERE id=$${keys.length + 1} AND owner=$${keys.length + 2}`,
            [...Object.values(data), existing.id, req.user.id],
          );
        }
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/bookings",
    need("driver"),
    route(async (req, res) =>
      res.json(
        await db.query(
          bookingSelect + ` WHERE b.session=$1 ORDER BY b.${startColumn} DESC`,
          [req.user.id],
        ),
      ),
    ),
  );
  app.post(
    "/api/bookings",
    need("driver"),
    route(async (req, res) => {
      const b = req.body;
      if (!b.eventId) windowValid(b.start, b.end);
      if (!["Bike", "Hatchback", "Sedan", "SUV"].includes(b.vehicle))
        throw fail("Choose a vehicle type.");
      const plate = text(b.plate, 16).toUpperCase().replace(/\s/g, "");
      if (!/^[A-Z0-9]{6,14}$/.test(plate))
        throw fail("Enter a valid registration.");
      res.json(await store.book({ ...b, plate, session: req.user.id }));
    }),
  );
  app.post(
    "/api/bookings/:id/cancel",
    need("driver"),
    route(async (req, res) => {
      const rows = await db.query(
        "UPDATE bookings SET status='cancelled' WHERE id=$1 AND session=$2 AND status='confirmed' RETURNING id",
        [req.params.id, req.user.id],
      );
      if (!rows.length) throw fail("Confirmed booking not found.", 404);
      res.json({ ok: true });
    }),
  );
  app.get(
    ["/api/owner", "/api/host/dashboard"],
    need("host"),
    route(async (req, res) => {
      const spaces = await db.query(
        "SELECT * FROM spaces WHERE owner=$1 ORDER BY id",
        [req.user.id],
      );
      const arrivals = await db.query(
        bookingSelect + ` WHERE s.owner=$1 ORDER BY b.${startColumn}`,
        [req.user.id],
      );
      const blocks = await db.query(
        "SELECT b.* FROM space_blocks b JOIN spaces s ON s.id=b.space_id WHERE s.owner=$1 ORDER BY b.start_time",
        [req.user.id],
      );
      res.json({ spaces, arrivals, blocks });
    }),
  );
  app.post(
    "/api/host/spaces/:id/blocks",
    need("host"),
    route(async (req, res) => {
      windowValid(req.body.start, req.body.end);
      res.json(
        await blockSpace(
          store,
          req.user.id,
          req.params.id,
          new Date(req.body.start).toISOString(),
          new Date(req.body.end).toISOString(),
        ),
      );
    }),
  );
  app.post(
    "/api/host/blocks/:id/remove",
    need("host"),
    route(async (req, res) => {
      const rows = await db.query(
        "DELETE FROM space_blocks WHERE id=$1 AND space_id IN (SELECT id FROM spaces WHERE owner=$2) RETURNING id",
        [req.params.id, req.user.id],
      );
      if (!rows.length) throw fail("Unavailable period not found.", 404);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/events",
    need("driver"),
    route(async (req, res) =>
      res.json(
        await db.query(
          `SELECT e.*, e.${startColumn} AS start,e.${endColumn} AS end,(SELECT count(*) FROM bookings b WHERE b.event_id=e.id AND b.status<>'cancelled') AS claimed FROM events e WHERE owner=$1 ORDER BY e.${startColumn} DESC`,
          [req.user.id],
        ),
      ),
    ),
  );
  app.get(
    "/api/events/:id",
    need("driver"),
    route(async (req, res) => {
      const event = (
        await db.query(
          `SELECT id,name,venue,${startColumn} AS start,${endColumn} AS end,quantity,(SELECT count(*) FROM bookings b WHERE b.event_id=events.id AND b.status<>'cancelled') AS claimed FROM events WHERE id=$1`,
          [req.params.id],
        )
      )[0];
      if (!event) throw fail("Invitation not found.", 404);
      res.json(event);
    }),
  );
  app.post(
    "/api/events",
    need("driver"),
    route(async (req, res) => {
      const b = req.body;
      windowValid(b.start, b.end);
      if (
        !Number.isInteger(b.quantity) ||
        b.quantity < 1 ||
        b.quantity > 100 ||
        !Array.isArray(b.spaceIds) ||
        !b.spaceIds.length ||
        b.spaceIds.length > 30 ||
        b.spaceIds.some((id) => typeof id !== "string")
      )
        throw fail("Choose locations and 1–100 spaces.");
      res.json({
        id: await store.createEvent({
          ...b,
          name: text(b.name),
          venue: text(b.venue),
          session: req.user.id,
        }),
      });
    }),
  );
  app.post(
    "/api/checkin",
    need("host"),
    route(async (req, res) => {
      const b = (
        await db.query(
          `SELECT b.*,b.${startColumn} AS start,b.${endColumn} AS end FROM bookings b JOIN spaces s ON s.id=b.space_id WHERE b.id=$1 AND s.owner=$2`,
          [text(req.body.id), req.user.id],
        )
      )[0];
      if (!b) throw fail("Pass not found at your locations.", 404);
      if (
        Date.now() < Date.parse(b.start) - 1800000 ||
        Date.now() > Date.parse(b.end)
      )
        throw fail(
          "Check-in opens 30 minutes before arrival and closes at departure.",
          409,
        );
      const updated = await db.query(
        "UPDATE bookings SET status='checked-in' WHERE id=$1 AND status='confirmed' RETURNING id",
        [b.id],
      );
      if (!updated.length)
        throw fail("Pass is cancelled or already checked in.", 409);
      res.json({ ok: true, plate: b.plate });
    }),
  );
  app.get(
    "/api/admin/listings",
    need("admin"),
    route(async (_req, res) =>
      res.json(await db.query("SELECT * FROM spaces ORDER BY status,id")),
    ),
  );
  app.patch(
    "/api/admin/listings/:id",
    need("admin"),
    route(async (req, res) => {
      if (!["active", "rejected", "paused"].includes(req.body.status))
        throw fail("Choose active, rejected or paused.");
      const updated = await db.query(
        "UPDATE spaces SET status=$1 WHERE id=$2 RETURNING id",
        [req.body.status, req.params.id],
      );
      if (!updated.length) throw fail("Listing not found.", 404);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/admin/users",
    need("admin"),
    route(async (_req, res) =>
      res.json(
        await db.query(
          "SELECT id,name,email,status, CASE WHEN EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=users.id AND r.role='admin') THEN 0 ELSE 1 END AS can_delete FROM users ORDER BY created_at DESC",
        ),
      ),
    ),
  );
  app.patch(
    "/api/admin/users/:id",
    need("admin"),
    route(async (req, res) => {
      if (
        req.params.id === req.user.id ||
        !["active", "suspended"].includes(req.body.status)
      )
        throw fail("Choose another account and a valid status.");
      if (
        (
          await db.query(
            "SELECT role FROM user_roles WHERE user_id=$1 AND role='admin'",
            [req.params.id],
          )
        ).length
      )
        throw fail(
          "Administrator accounts must be managed from the server.",
          403,
        );
      const updated = await db.query(
        "UPDATE users SET status=$1 WHERE id=$2 RETURNING id",
        [req.body.status, req.params.id],
      );
      if (!updated.length) throw fail("User not found.", 404);
      await db.query("DELETE FROM sessions WHERE user_id=$1", [req.params.id]);
      res.json({ ok: true });
    }),
  );
  app.delete(
    "/api/admin/users/:id",
    need("admin"),
    route(async (req, res) => {
      await inventoryTransaction(store, async (tx) => {
        const id = req.params.id;
        if (id === req.user.id) throw fail("You cannot delete your own account.", 403);
        if ((await tx.query("SELECT role FROM user_roles WHERE user_id=$1 AND role='admin'", [id])).length)
          throw fail("Administrator accounts must be managed from the server.", 403);
        const user = (await tx.query("SELECT email FROM users WHERE id=$1", [id]))[0];
        if (!user) throw fail("User not found.", 404);
        if (req.body.email !== user.email) throw fail("Enter the account email to confirm deletion.");
        const now = new Date().toISOString();
        const reservations = await tx.query(
          `SELECT b.id FROM bookings b LEFT JOIN spaces s ON s.id=b.space_id WHERE (b.session=$1 OR s.owner=$1) AND b.status<>'cancelled' AND b.${endColumn}>$2`, [id, now]);
        const events = await tx.query(`SELECT id FROM events WHERE owner=$1 AND ${endColumn}>$2`, [id, now]);
        const allocations = await tx.query(`SELECT a.id FROM allocations a JOIN spaces s ON s.id=a.space_id WHERE s.owner=$1 AND a.${endColumn}>$2`, [id, now]);
        if (reservations.length || events.length || allocations.length)
          throw fail("Resolve upcoming bookings and events before deleting this account.", 409);
        await tx.query("UPDATE spaces SET status='paused' WHERE owner=$1", [id]);
        await tx.query("DELETE FROM sessions WHERE user_id=$1", [id]);
        await tx.query("DELETE FROM user_roles WHERE user_id=$1", [id]);
        await tx.query("DELETE FROM users WHERE id=$1", [id]);
      });
      res.json({ ok: true });
    }),
  );
  app.use("/api", (_req, _res, next) => next(fail("Endpoint not found.", 404)));
  app.use(express.static(resolve("dist")));
  app.get("*", (_req, res) => res.sendFile(resolve("dist/index.html")));
  app.use((error, _req, res, _next) => {
    const status = error.status || (error.code ? 500 : 400);
    if (status >= 500)
      console.error("API database error:", error.code || "internal");
    res.status(status).json({
      error:
        status >= 500
          ? "Unable to complete the request. Try again."
          : error.message,
    });
  });
  return app;
}
