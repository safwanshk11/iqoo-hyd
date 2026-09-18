import { quote } from "./pricing.js";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
export function createStore(path = ":memory:") {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(
    `CREATE TABLE IF NOT EXISTS spaces(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,area TEXT NOT NULL,address TEXT NOT NULL,lat REAL,lng REAL,price INTEGER,capacity INTEGER,vehicle TEXT,covered INTEGER,ev INTEGER,instructions TEXT,kind TEXT); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,owner TEXT,name TEXT,venue TEXT,start TEXT,end TEXT,quantity INTEGER); CREATE TABLE IF NOT EXISTS allocations(id TEXT PRIMARY KEY,space_id TEXT REFERENCES spaces(id),event_id TEXT REFERENCES events(id),start TEXT,end TEXT); CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,session TEXT,space_id TEXT REFERENCES spaces(id),event_id TEXT REFERENCES events(id),allocation_id TEXT REFERENCES allocations(id),start TEXT,end TEXT,vehicle TEXT,plate TEXT,status TEXT,total INTEGER);`,
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS space_blocks(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),start_time TEXT NOT NULL,end_time TEXT NOT NULL)",
  );
  if (!db.prepare("SELECT id FROM spaces LIMIT 1").get()) {
    const insert = db.prepare(
      "INSERT INTO spaces(id,owner,name,area,address,lat,lng,price,capacity,vehicle,covered,ev,instructions,kind) VALUES (@id,@owner,@name,@area,@address,@lat,@lng,@price,@capacity,@vehicle,@covered,@ev,@instructions,@kind)",
    );
    [
      [
        "s1",
        "The courtyard on Road 36",
        "Jubilee Hills",
        "Road 36, near Peddamma Gudi Metro",
        17.4363,
        78.4065,
        40,
        6,
        "SUV",
        1,
        0,
        "Enter through the blue gate on Road 36. Show your pass to the attendant.",
        "Private driveway",
      ],
      [
        "s2",
        "Metro-side parking",
        "Jubilee Hills",
        "Road 10, Jubilee Hills checkpost",
        17.4293,
        78.4135,
        30,
        10,
        "SUV",
        0,
        0,
        "Use the entrance beside the metro stairs. Bays are numbered.",
        "Open lot",
      ],
      [
        "s3",
        "The shaded corner",
        "Jubilee Hills",
        "Road 45, Jubilee Hills",
        17.4328,
        78.3998,
        50,
        4,
        "Sedan",
        1,
        1,
        "Enter from the service lane. Charging is not included in parking.",
        "Residential compound",
      ],
      [
        "s4",
        "Mindspace west gate",
        "HITEC City",
        "Mindspace Road, Madhapur",
        17.4411,
        78.3788,
        45,
        12,
        "SUV",
        1,
        1,
        "Use the west service gate and follow parking signs.",
        "Commercial parking",
      ],
      [
        "s5",
        "A quiet space in Banjara",
        "Banjara Hills",
        "Road 12, Banjara Hills",
        17.4124,
        78.4382,
        35,
        3,
        "Sedan",
        0,
        0,
        "Call the attendant on arrival using the contact provided at the gate.",
        "Private driveway",
      ],
      [
        "s6",
        "Gachibowli neighbourhood lot",
        "Gachibowli",
        "Indira Nagar, Gachibowli",
        17.438,
        78.3489,
        25,
        15,
        "SUV",
        0,
        0,
        "Entrance faces the main road. Show your booking pass.",
        "Open lot",
      ],
      [
        "s7",
        "Airport approach parking",
        "Shamshabad",
        "Airport approach road, Shamshabad",
        17.2602,
        78.388,
        30,
        20,
        "SUV",
        1,
        0,
        "Demo location outside the airport. No airport shuttle is included.",
        "Commercial parking",
      ],
    ].forEach(
      ([
        id,
        name,
        area,
        address,
        lat,
        lng,
        price,
        capacity,
        vehicle,
        covered,
        ev,
        instructions,
        kind,
      ]) =>
        insert.run({
          id,
          owner: "demo",
          name,
          area,
          address,
          lat,
          lng,
          price,
          capacity,
          vehicle,
          covered,
          ev,
          instructions,
          kind,
        }),
    );
  }
  const overlap = "start < @end AND end > @start";
  function available(spaceId, start, end) {
    const s = db.prepare("SELECT * FROM spaces WHERE id=?").get(spaceId);
    if (!s || (s.status && s.status !== "active")) return 0;
    if (
      db
        .prepare(
          "SELECT id FROM space_blocks WHERE space_id=? AND start_time < ? AND end_time > ?",
        )
        .get(spaceId, end, start)
    )
      return 0;
    const a = db
      .prepare(
        `SELECT count(*) n FROM allocations WHERE space_id=@id AND ${overlap}`,
      )
      .get({ id: spaceId, start, end }).n;
    const b = db
      .prepare(
        `SELECT count(*) n FROM bookings WHERE space_id=@id AND event_id IS NULL AND status!='cancelled' AND ${overlap}`,
      )
      .get({ id: spaceId, start, end }).n;
    return Math.max(0, s.capacity - a - b);
  }
  const fits = (space, vehicle) =>
    ["Bike", "Hatchback", "Sedan", "SUV"].indexOf(vehicle) <=
    ["Bike", "Hatchback", "Sedan", "SUV"].indexOf(space.vehicle);
  const book = db.transaction(
    ({ session, spaceId, eventId, start, end, vehicle, plate }) => {
      let allocation = null,
        space;
      if (eventId) {
        const event = db
          .prepare("SELECT * FROM events WHERE id=?")
          .get(eventId);
        if (!event) throw Error("Event not found.");
        start = event.start;
        end = event.end;
        const existing = db
          .prepare(
            "SELECT id FROM bookings WHERE event_id=? AND (session=? OR plate=?) AND status!='cancelled'",
          )
          .get(eventId, session, plate);
        if (existing)
          throw Error(
            "A parking pass has already been claimed for this guest or vehicle.",
          );
        const options = db
          .prepare(
            "SELECT a.* FROM allocations a WHERE event_id=? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.allocation_id=a.id AND b.status!='cancelled') ORDER BY rowid",
          )
          .all(eventId);
        for (const a of options) {
          const s = db
            .prepare("SELECT * FROM spaces WHERE id=?")
            .get(a.space_id);
          if (fits(s, vehicle)) {
            allocation = a;
            space = s;
            break;
          }
        }
        if (!space) throw Error("No compatible spaces remain for this event.");
      } else {
        space = db.prepare("SELECT * FROM spaces WHERE id=?").get(spaceId);
        if (
          !space ||
          (space.status && space.status !== "active") ||
          !fits(space, vehicle)
        )
          throw Error("This space does not fit your vehicle.");
        if (!available(spaceId, start, end))
          throw Error("This space was just booked. Please choose another.");
      }
      const duplicate = db
        .prepare(
          `SELECT id FROM bookings WHERE session=@session AND plate=@plate AND status!='cancelled' AND ${overlap}`,
        )
        .get({ session, plate, start, end });
      if (duplicate)
        throw Error("This vehicle already has a booking during that time.");
      const b = {
        id: randomUUID(),
        session,
        space_id: space.id,
        event_id: eventId || null,
        allocation_id: allocation?.id || null,
        start,
        end,
        vehicle,
        plate,
        status: "confirmed",
        total: eventId ? 0 : quote(space, start, end).total,
      };
      db.prepare(
        "INSERT INTO bookings VALUES (@id,@session,@space_id,@event_id,@allocation_id,@start,@end,@vehicle,@plate,@status,@total)",
      ).run(b);
      return b;
    },
  );
  const createEvent = db.transaction(
    ({ session, name, venue, start, end, quantity, spaceIds }) => {
      let chosen = [];
      for (const id of [...new Set(spaceIds)]) {
        for (
          let i = 0, n = available(id, start, end);
          i < n && chosen.length < quantity;
          i++
        )
          chosen.push(id);
      }
      if (chosen.length < quantity)
        throw Error(
          "Not enough available spaces. Reduce the quantity or add locations.",
        );
      const id = randomUUID();
      db.prepare("INSERT INTO events VALUES (?,?,?,?,?,?,?)").run(
        id,
        session,
        name,
        venue,
        start,
        end,
        quantity,
      );
      const put = db.prepare("INSERT INTO allocations VALUES (?,?,?,?,?)");
      chosen.forEach((s) => put.run(randomUUID(), s, id, start, end));
      return id;
    },
  );
  return { db, available, book, createEvent };
}
