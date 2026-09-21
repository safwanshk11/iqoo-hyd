import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { createApp } from "../server/app.js";
import { quote } from "../server/pricing.js";
import { createNeonStore } from "../server/neon-store.js";
import { database } from "../server/database.js";

test("accounts enforce roles, ownership, review, pricing, expiry and logout", async (t) => {
  const store = process.env.PARKLY_TEST_NEON_URL
    ? createNeonStore(
        process.env.PARKLY_TEST_NEON_URL,
        process.env.PARKLY_TEST_NEON_SCHEMA,
      )
    : createStore();
  if (store.init) await store.init();
  const db = database(store);
  const app = await createApp(store, { secure: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    server.close();
    if (store.pool) await store.pool.end();
    else store.db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, { cookie, body, method, headers = {} } = {}) => {
    const r = await fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
      setCookie: r.headers.get("set-cookie"),
    };
  };
  const register = async (email, role = "driver") => {
    const r = await request("/auth/register", {
      body: {
        name: "Test user",
        email,
        password: "a-long-test-password",
        role,
      },
    });
    assert.equal(r.status, 200);
    return r;
  };
  assert.equal(
    (
      await request("/bookings", {
        headers: { "X-Session": "12345678-1234-1234-1234-123456789012" },
      })
    ).status,
    401,
  );
  const driver = await register("driver@example.com"),
    other = await register("other@example.com"),
    host = await register("host@example.com", "host"),
    host2 = await register("host2@example.com", "host");
  assert.match(driver.setCookie, /HttpOnly/);
  assert.match(driver.setCookie, /SameSite=Lax/);
  assert.equal(
    (
      await request("/auth/register", {
        body: {
          name: "Bad",
          email: "admin@example.com",
          password: "a-long-test-password",
          role: "admin",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/login", {
        body: { email: "driver@example.com", password: "wrong" },
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("/owner", { cookie: driver.cookie })).status,
    403,
  );
  assert.equal(
    (await request("/admin/listings", { cookie: host.cookie })).status,
    403,
  );
  assert.equal(
    (
      await request("/auth/host", {
        cookie: driver.cookie,
        body: { role: "admin" },
      })
    ).data.user.roles.includes("admin"),
    false,
  );
  assert.equal(
    (await request("/auth/host", { cookie: driver.cookie, body: {} })).status,
    200,
  );
  const listing = {
    name: "Private test space",
    area: "Jubilee Hills",
    address: "Test address",
    instructions: "Use the gate",
    lat: 17.43,
    lng: 78.4,
    price: 40,
    daily_rate: 300,
    monthly_rate: 4500,
    capacity: 1,
    vehicle: "SUV",
    covered: true,
    ev: false,
    status: "active",
    owner: other.data.user.id,
  };
  const created = await request("/spaces", {
    cookie: host.cookie,
    body: listing,
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.status, "pending_review");
  const space = (
    await db.query("SELECT * FROM spaces WHERE id=$1", [created.data.id])
  )[0];
  assert.equal(space.owner, host.data.user.id);
  const start = new Date(Date.now() + 3600000).toISOString(),
    end = new Date(Date.now() + 10800000).toISOString();
  const path =
    "/spaces?start=" +
    encodeURIComponent(start) +
    "&end=" +
    encodeURIComponent(end);
  const discovery = await request(path, { cookie: other.cookie });
  assert.equal(discovery.status, 200, JSON.stringify(discovery.data));
  assert.equal(
    discovery.data.some((s) => s.id === space.id),
    false,
  );
  assert.equal(
    (
      await request("/host/spaces/" + space.id, {
        cookie: host2.cookie,
        body: listing,
        method: "PATCH",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/host/spaces/" + space.id, {
        cookie: host.cookie,
        body: { status: "active" },
        method: "PATCH",
      })
    ).status,
    400,
  );
  const booking = {
    spaceId: space.id,
    start,
    end,
    vehicle: "Sedan",
    plate: "TS09AB1234",
    session: host.data.user.id,
    total: 1,
  };
  assert.equal(
    (await request("/bookings", { cookie: other.cookie, body: booking }))
      .status,
    400,
  );
  await db.query("INSERT INTO user_roles(user_id,role) VALUES ($1,'admin')", [
    driver.data.user.id,
  ]);
  assert.equal(
    (
      await request("/admin/listings/" + space.id, {
        cookie: driver.cookie,
        body: { status: "active" },
        method: "PATCH",
      })
    ).status,
    200,
  );
  const booked = await request("/bookings", {
    cookie: other.cookie,
    body: booking,
  });
  assert.equal(booked.status, 200, JSON.stringify(booked.data));
  assert.equal(booked.data.session, other.data.user.id);
  assert.equal(booked.data.total, 80);
  assert.equal(
    (await request("/bookings", { cookie: driver.cookie })).data.length,
    0,
  );
  assert.equal(
    (await request("/owner", { cookie: host2.cookie })).data.arrivals.length,
    0,
  );
  assert.equal(
    (await request("/owner", { cookie: host.cookie })).data.arrivals.length,
    1,
  );
  assert.equal(
    (
      await request("/bookings/" + booked.data.id + "/cancel", {
        cookie: driver.cookie,
        body: {},
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/checkin", {
        cookie: host2.cookie,
        body: { id: booked.data.id },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/checkin", {
        cookie: other.cookie,
        body: { id: booked.data.id },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/host/spaces/" + space.id, {
        cookie: host.cookie,
        body: { ...listing, capacity: 2 },
        method: "PATCH",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/host/spaces/" + space.id + "/blocks", {
        cookie: host.cookie,
        body: { start, end },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/bookings/" + booked.data.id + "/cancel", {
        cookie: other.cookie,
        body: {},
      })
    ).status,
    200,
  );
  const blocked = await request("/host/spaces/" + space.id + "/blocks", {
    cookie: host.cookie,
    body: { start, end },
  });
  assert.equal(blocked.status, 200);
  assert.equal(
    (await request(path, { cookie: other.cookie })).data.find(
      (s) => s.id === space.id,
    ).available,
    0,
  );
  assert.equal(
    (await request("/bookings", { cookie: other.cookie, body: booking }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/host/blocks/" + blocked.data.id + "/remove", {
        cookie: host2.cookie,
        body: {},
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/host/blocks/" + blocked.data.id + "/remove", {
        cookie: host.cookie,
        body: {},
      })
    ).status,
    200,
  );

  const simultaneous = await Promise.all([
    request("/bookings", { cookie: other.cookie, body: booking }),
    request("/bookings", {
      cookie: driver.cookie,
      body: { ...booking, plate: "TS09CD1234" },
    }),
  ]);
  assert.equal(simultaneous.filter((r) => r.status === 200).length, 1);
  const winner = simultaneous.find((r) => r.status === 200);
  const winnerCookie =
    winner.data.session === other.data.user.id ? other.cookie : driver.cookie;
  await request("/bookings/" + winner.data.id + "/cancel", {
    cookie: winnerCookie,
    body: {},
  });
  assert.equal(
    (
      await request("/host/spaces/" + space.id, {
        cookie: host.cookie,
        body: { ...listing, monthly_rate: 5000 },
        method: "PATCH",
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.query("SELECT status FROM spaces WHERE id=$1", [space.id]))[0]
      .status,
    "pending_review",
  );
  assert.equal(
    (
      await request("/auth/login", {
        body: { email: "driver@example.com", password: "a-long-test-password" },
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/auth/logout", { cookie: other.cookie, body: {} })).status,
    200,
  );
  assert.equal((await request("/me", { cookie: other.cookie })).status, 401);
  const disposable = await register("delete@example.com");
  const deletePath = "/admin/users/" + disposable.data.user.id;
  assert.equal((await request(deletePath, { cookie: disposable.cookie, method: "DELETE", body: { email: "delete@example.com" } })).status, 403);
  assert.equal((await request("/admin/users/" + driver.data.user.id, { cookie: driver.cookie, method: "DELETE", body: { email: "driver@example.com" } })).status, 403);
  assert.equal((await request(deletePath, { cookie: driver.cookie, method: "DELETE", body: { email: "wrong@example.com" } })).status, 400);
  const endField = store.pool ? "end_time" : "end";
  const startField = store.pool ? "start_time" : "start";
  await db.query(`INSERT INTO events(id,owner,name,venue,${startField},${endField},quantity) VALUES($1,$2,$3,$4,$5,$6,$7)`, ["delete-guard", disposable.data.user.id, "Future event", "Test", new Date(Date.now()+86400000).toISOString(), new Date(Date.now()+172800000).toISOString(), 1]);
  assert.equal((await request(deletePath, { cookie: driver.cookie, method: "DELETE", body: { email: "delete@example.com" } })).status, 409);
  await db.query("DELETE FROM events WHERE id=$1", ["delete-guard"]);
  assert.equal((await request(deletePath, { cookie: driver.cookie, method: "DELETE", body: { email: "delete@example.com" } })).status, 200);
  assert.equal((await request("/me", { cookie: disposable.cookie })).status, 401);
  assert.equal((await db.query("SELECT id FROM users WHERE id=$1", [disposable.data.user.id])).length, 0);
  await db.query(
    "UPDATE sessions SET expires_at='2000-01-01' WHERE user_id=$1",
    [host.data.user.id],
  );
  assert.equal((await request("/me", { cookie: host.cookie })).status, 401);
  const login = await request("/auth/login", {
    body: { email: "host2@example.com", password: "a-long-test-password" },
  });
  assert.equal(login.status, 200);
  await request("/admin/users/" + host2.data.user.id, {
    cookie: driver.cookie,
    body: { status: "suspended" },
    method: "PATCH",
  });
  assert.equal((await request("/me", { cookie: login.cookie })).status, 401);
  assert.equal(
    (
      await request("/auth/login", {
        body: { email: "host2@example.com", password: "a-long-test-password" },
      })
    ).status,
    401,
  );
});

test("quotes cap hourly charges, use daily rates through day ten and whole months after", () => {
  const s = { price: 40, daily_rate: 300, monthly_rate: 4500 };
  const start = "2027-01-01T00:00:00Z";
  const at = (hours) =>
    quote(
      s,
      start,
      new Date(Date.parse(start) + hours * 3600000).toISOString(),
    );
  assert.equal(at(2).total, 80);
  assert.equal(at(12).total, 300);
  assert.equal(at(25).total, 340);
  assert.equal(at(240).total, 3000);
  assert.equal(at(241).total, 4500);
  assert.equal(at(720).total, 4500);
  assert.equal(at(721).total, 9000);
});
