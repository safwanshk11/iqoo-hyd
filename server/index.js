import express from "express";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createStore } from "./store.js";
mkdirSync("data", { recursive: true });
const { db, available, book, createEvent } = createStore("data/parkly.sqlite");
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "50kb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.path === "/health") return res.json({ ok: true });
  const session = req.get("X-Session");
  if (!session || !/^[a-f0-9-]{36}$/.test(session))
    return res
      .status(401)
      .json({ error: "Refresh to start your demo session." });
  req.session = session;
  next();
});
const windowValid = (start, end) => {
  if (
    !start ||
    !end ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(start) < Date.now() - 60000 ||
    Date.parse(end) - Date.parse(start) > 32 * 86400000
  )
    throw Error(
      "Choose a future arrival and a later departure, up to 32 days apart.",
    );
};
const text = (v, max = 120) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw Error("Please complete all fields with valid values.");
  return v.trim();
};
app.get("/api/spaces", (req, res) => {
  try {
    const { start, end } = req.query;
    windowValid(start, end);
    res.json(
      db
        .prepare("SELECT * FROM spaces")
        .all()
        .map(({ owner, ...s }) => ({
          ...s,
          available: available(s.id, start, end),
        })),
    );
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/spaces", (req, res) => {
  try {
    const b = req.body;
    const name = text(b.name),
      area = text(b.area),
      address = text(b.address),
      instructions = text(b.instructions, 1000);
    if (
      !["Bike", "Hatchback", "Sedan", "SUV"].includes(b.vehicle) ||
      !Number.isInteger(b.capacity) ||
      b.capacity < 1 ||
      b.capacity > 100 ||
      !Number.isInteger(b.price) ||
      b.price < 1 ||
      b.price > 10000 ||
      !Number.isFinite(b.lat) ||
      !Number.isFinite(b.lng) ||
      b.lat < 17 ||
      b.lat > 18 ||
      b.lng < 78 ||
      b.lng > 79
    )
      throw Error(
        "Check price, capacity, vehicle size, and Hyderabad coordinates.",
      );
    const id = randomUUID();
    db.prepare("INSERT INTO spaces VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id,
      req.session,
      name,
      area,
      address,
      b.lat,
      b.lng,
      b.price,
      b.capacity,
      b.vehicle,
      b.covered ? 1 : 0,
      b.ev ? 1 : 0,
      instructions,
      "Private driveway",
    );
    res.json({ id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/bookings", (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT b.*,s.name,s.area,s.address,s.instructions,s.lat,s.lng FROM bookings b JOIN spaces s ON s.id=b.space_id WHERE b.session=? ORDER BY b.rowid DESC",
      )
      .all(req.session),
  ),
);
app.post("/api/bookings", (req, res) => {
  try {
    const b = req.body;
    if (!b.eventId) windowValid(b.start, b.end);
    if (!["Bike", "Hatchback", "Sedan", "SUV"].includes(b.vehicle))
      throw Error("Choose a vehicle type.");
    const plate = text(b.plate, 16).toUpperCase().replace(/\s/g, "");
    if (!/^[A-Z0-9]{6,14}$/.test(plate))
      throw Error("Enter a valid vehicle registration.");
    res.json(book({ ...b, plate, session: req.session }));
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});
app.post("/api/bookings/:id/cancel", (req, res) => {
  const b = db
    .prepare("SELECT * FROM bookings WHERE id=? AND session=?")
    .get(req.params.id, req.session);
  if (!b || b.status !== "confirmed")
    return res
      .status(400)
      .json({ error: "Only a confirmed booking can be cancelled." });
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(b.id);
  res.json({ ok: true });
});
app.get("/api/owner", (req, res) =>
  res.json({
    spaces: db.prepare("SELECT * FROM spaces WHERE owner=?").all(req.session),
    arrivals: db
      .prepare(
        "SELECT b.*,s.name FROM bookings b JOIN spaces s ON s.id=b.space_id LEFT JOIN events e ON e.id=b.event_id WHERE s.owner=? OR e.owner=? ORDER BY b.start",
      )
      .all(req.session, req.session),
  }),
);
app.get("/api/events", (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT e.*,(SELECT count(*) FROM bookings b WHERE b.event_id=e.id AND b.status!='cancelled') claimed FROM events e WHERE owner=? ORDER BY rowid DESC",
      )
      .all(req.session),
  ),
);
app.get("/api/events/:id", (req, res) => {
  const event = db
    .prepare(
      "SELECT id,name,venue,start,end,quantity,(SELECT count(*) FROM bookings b WHERE b.event_id=events.id AND b.status!='cancelled') claimed FROM events WHERE id=?",
    )
    .get(req.params.id);
  if (!event)
    return res.status(404).json({ error: "This invitation was not found." });
  res.json(event);
});
app.post("/api/events", (req, res) => {
  try {
    const b = req.body;
    windowValid(b.start, b.end);
    if (
      !Number.isInteger(b.quantity) ||
      b.quantity < 1 ||
      b.quantity > 100 ||
      !Array.isArray(b.spaceIds) ||
      !b.spaceIds.length ||
      b.spaceIds.length > 30
    )
      throw Error("Choose locations and a quantity between 1 and 100.");
    const id = createEvent({
      ...b,
      name: text(b.name),
      venue: text(b.venue),
      session: req.session,
    });
    res.json({ id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/checkin", (req, res) => {
  const id = req.body.id;
  const b = db
    .prepare(
      "SELECT b.*,s.owner,e.owner event_owner FROM bookings b JOIN spaces s ON s.id=b.space_id LEFT JOIN events e ON e.id=b.event_id WHERE b.id=?",
    )
    .get(id);
  if (!b || ![b.owner, b.event_owner].includes(req.session))
    return res
      .status(403)
      .json({
        error:
          "Pass not found, or you do not manage this parking location/event.",
      });
  if (b.status !== "confirmed")
    return res
      .status(409)
      .json({ error: "This pass is cancelled or already checked in." });
  if (
    Date.now() < Date.parse(b.start) - 1800000 ||
    Date.now() > Date.parse(b.end)
  )
    return res
      .status(409)
      .json({
        error:
          "Check-in opens 30 minutes before arrival and closes at departure.",
      });
  db.prepare("UPDATE bookings SET status='checked-in' WHERE id=?").run(id);
  res.json({ ok: true, plate: b.plate });
});
app.use(express.static(resolve("dist")));
app.get("*", (req, res) => res.sendFile(resolve("dist/index.html")));
app.listen(3001, "127.0.0.1", () =>
  console.log("Parkly API: http://127.0.0.1:3001"),
);
