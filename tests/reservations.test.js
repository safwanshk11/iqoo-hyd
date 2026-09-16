import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
const start = "2027-01-01T10:00:00.000Z",
  end = "2027-01-01T12:00:00.000Z";
const request = {
  spaceId: "s1",
  start,
  end,
  vehicle: "SUV",
  plate: "TS09AB1234",
  session: "guest",
};
test("individual bookings cannot exceed inventory and back-to-back bookings are allowed", () => {
  const s = createStore();
  for (let i = 0; i < 6; i++)
    s.book({ ...request, session: "g" + i, plate: "TS09AB" + i });
  assert.equal(s.available("s1", start, end), 0);
  assert.throws(() => s.book({ ...request, session: "extra" }), /just booked/);
  assert.equal(s.available("s1", end, "2027-01-01T14:00:00.000Z"), 6);
  s.db.close();
});
test("event inventory is excluded from public availability, and guest claims do not double count", () => {
  const s = createStore();
  const id = s.createEvent({
    session: "owner",
    name: "Wedding",
    venue: "Jubilee Hills",
    start,
    end,
    quantity: 4,
    spaceIds: ["s1"],
  });
  assert.equal(s.available("s1", start, end), 2);
  s.book({ ...request, eventId: id });
  assert.equal(s.available("s1", start, end), 2);
  assert.throws(
    () => s.book({ ...request, eventId: id }),
    /already been claimed/,
  );
  s.db.close();
});
test("failed bulk reservations roll back all allocations", () => {
  const s = createStore();
  assert.throws(
    () =>
      s.createEvent({
        session: "owner",
        name: "Wedding",
        venue: "Jubilee Hills",
        start,
        end,
        quantity: 100,
        spaceIds: ["s1"],
      }),
    /Not enough/,
  );
  assert.equal(s.db.prepare("SELECT count(*) n FROM events").get().n, 0);
  assert.equal(s.available("s1", start, end), 6);
  s.db.close();
});
test("cancelled individual reservations release capacity", () => {
  const s = createStore();
  const b = s.book(request);
  assert.equal(s.available("s1", start, end), 5);
  s.db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(b.id);
  assert.equal(s.available("s1", start, end), 6);
  s.db.close();
});
test("stays over ten days use the monthly rate", () => {
  const s = createStore();
  const tenDays = s.book({
    ...request,
    start: "2027-01-01T10:00:00.000Z",
    end: "2027-01-11T10:00:00.000Z",
    session: "ten-days",
    plate: "TS09TEN123",
  });
  const monthly = s.book({
    ...request,
    start: "2027-01-01T10:00:00.000Z",
    end: "2027-01-12T10:00:00.000Z",
    session: "monthly",
    plate: "TS09MON123",
  });
  assert.equal(tenDays.total, 40 * 24 * 10);
  assert.equal(monthly.total, 40 * 24 * 30);
  s.db.close();
});
test("incompatible vehicles rejected and event allocator skips incompatible locations", () => {
  const s = createStore();
  assert.throws(() => s.book({ ...request, spaceId: "s3" }), /does not fit/);
  const id = s.createEvent({
    session: "owner",
    name: "Wedding",
    venue: "Jubilee Hills",
    start,
    end,
    quantity: 5,
    spaceIds: ["s3", "s1"],
  });
  const b = s.book({ ...request, eventId: id });
  assert.equal(b.space_id, "s1");
  s.db.close();
});
test("released event pass stays reserved for that event and can be reassigned", () => {
  const s = createStore();
  const id = s.createEvent({
    session: "owner",
    name: "Wedding",
    venue: "Jubilee Hills",
    start,
    end,
    quantity: 1,
    spaceIds: ["s1"],
  });
  const b = s.book({ ...request, eventId: id });
  s.db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(b.id);
  assert.equal(s.available("s1", start, end), 5);
  const other = s.book({
    ...request,
    session: "other",
    plate: "TS09CD4321",
    eventId: id,
  });
  assert.equal(other.allocation_id, b.allocation_id);
  s.db.close();
});
