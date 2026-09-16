import express from "express";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createNeonStore } from "./neon-store.js";

const store = createNeonStore();
await store.init();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "50kb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const origin = req.get("Origin");
  if (origin === "http://localhost" || origin === "capacitor://localhost") {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type, X-Session");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  if (req.path === "/health") return res.json({ ok: true });
  const session = req.get("X-Session");
  if (!session || !/^[a-f0-9-]{36}$/.test(session)) return res.status(401).json({ error: "Refresh to start your demo session." });
  req.session = session;
  next();
});
const windowValid = (start, end) => {
  if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start) || Date.parse(start) < Date.now() - 60000 || Date.parse(end) - Date.parse(start) > 32 * 86400000) throw Error("Choose a future arrival and a later departure, up to 32 days apart.");
};
const text = (value, max = 120) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw Error("Please complete all fields with valid values.");
  return value.trim();
};
app.get("/api/spaces", async (req, res) => {
  try {
    windowValid(req.query.start, req.query.end);
    res.json(await store.getSpaces(req.query.start, req.query.end));
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post("/api/spaces", async (req, res) => {
  try {
    const body = req.body;
    if (!["Bike", "Hatchback", "Sedan", "SUV"].includes(body.vehicle) || !Number.isInteger(body.capacity) || body.capacity < 1 || body.capacity > 100 || !Number.isInteger(body.price) || body.price < 1 || body.price > 10000 || !Number.isFinite(body.lat) || !Number.isFinite(body.lng) || body.lat < 17 || body.lat > 18 || body.lng < 78 || body.lng > 79) throw Error("Check price, capacity, vehicle size, and Hyderabad coordinates.");
    res.json(await store.createSpace({ owner: req.session, name: text(body.name), area: text(body.area), address: text(body.address), lat: body.lat, lng: body.lng, price: body.price, capacity: body.capacity, vehicle: body.vehicle, covered: body.covered, ev: body.ev, instructions: text(body.instructions, 1000) }));
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.get("/api/bookings", async (req, res) => res.json(await store.getBookings(req.session)));
app.post("/api/bookings", async (req, res) => {
  try {
    const body = req.body;
    if (!body.eventId) windowValid(body.start, body.end);
    if (!["Bike", "Hatchback", "Sedan", "SUV"].includes(body.vehicle)) throw Error("Choose a vehicle type.");
    const plate = text(body.plate, 16).toUpperCase().replace(/\s/g, "");
    if (!/^[A-Z0-9]{6,14}$/.test(plate)) throw Error("Enter a valid vehicle registration.");
    res.json(await store.book({ ...body, plate, session: req.session }));
  } catch (error) { res.status(409).json({ error: error.message }); }
});
app.post("/api/bookings/:id/cancel", async (req, res) => {
  const booking = await store.cancelBooking(req.params.id, req.session);
  if (!booking) return res.status(400).json({ error: "Only a confirmed booking can be cancelled." });
  res.json({ ok: true });
});
app.get("/api/owner", async (req, res) => res.json(await store.getOwner(req.session)));
app.get("/api/events", async (req, res) => res.json(await store.getEvents(req.session)));
app.get("/api/events/:id", async (req, res) => {
  const event = await store.getEvent(req.params.id);
  if (!event) return res.status(404).json({ error: "This invitation was not found." });
  res.json(event);
});
app.post("/api/events", async (req, res) => {
  try {
    const body = req.body;
    windowValid(body.start, body.end);
    if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 100 || !Array.isArray(body.spaceIds) || !body.spaceIds.length || body.spaceIds.length > 30) throw Error("Choose locations and a quantity between 1 and 100.");
    res.json({ id: await store.createEvent({ ...body, name: text(body.name), venue: text(body.venue), session: req.session }) });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post("/api/checkin", async (req, res) => {
  try { res.json(await store.checkIn(req.body.id, req.session)); }
  catch (error) { res.status(error.message.includes("Pass not found") ? 403 : 409).json({ error: error.message }); }
});
app.use(express.static(resolve("dist")));
app.get("*", (req, res) => res.sendFile(resolve("dist/index.html")));
const port = Number(process.env.PORT || 3001);
app.listen(port, "0.0.0.0", () => console.log(`Parkly Neon API: http://0.0.0.0:${port}`));
