import { quote } from "./pricing.js";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const vehicles = ["Bike", "Hatchback", "Sedan", "SUV"];
const seedSpaces = [
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
    true,
    false,
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
    false,
    false,
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
    true,
    true,
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
    true,
    true,
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
    false,
    false,
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
    false,
    false,
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
    true,
    false,
    "Demo location outside the airport. No airport shuttle is included.",
    "Commercial parking",
  ],
];

const fits = (space, vehicle) =>
  vehicles.indexOf(vehicle) <= vehicles.indexOf(space.vehicle);
export function createNeonStore(
  connectionString = process.env.DATABASE_URL,
  testSchema,
) {
  if (!connectionString) throw Error("DATABASE_URL is required for Neon.");
  const pool = new Pool({ connectionString });
  if (testSchema) {
    if (!/^parkly_test_[a-f0-9]{16}$/.test(testSchema))
      throw Error("Invalid test schema.");
    pool.on("connect", (client) => {
      const originalQuery = client.query.bind(client);
      client.query = (sql, ...args) =>
        originalQuery(
          typeof sql === "string"
            ? sql.replace(
                /\b(spaces|events|allocations|bookings|users|user_roles|sessions|space_blocks)\b/g,
                (table) => `"${testSchema}"."${table}"`,
              )
            : sql,
          ...args,
        );
    });
  }
  pool.on("error", (error) =>
    console.error("Neon connection error:", error.code || "connection lost"),
  );
  const init = async () => {
    const client = await pool.connect();
    try {
      await client.query(
        "SELECT pg_advisory_lock(hashtextextended('parkly-schema-init', 0))",
      );
      await client.query(`
      CREATE TABLE IF NOT EXISTS spaces (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, area TEXT NOT NULL,
        address TEXT NOT NULL, lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
        price INTEGER NOT NULL, capacity INTEGER NOT NULL, vehicle TEXT NOT NULL,
        covered BOOLEAN NOT NULL DEFAULT FALSE, ev BOOLEAN NOT NULL DEFAULT FALSE,
        instructions TEXT NOT NULL, kind TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, venue TEXT NOT NULL,
        start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL, quantity INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS allocations (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), event_id TEXT NOT NULL REFERENCES events(id),
        start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY, session TEXT NOT NULL, space_id TEXT NOT NULL REFERENCES spaces(id),
        event_id TEXT REFERENCES events(id), allocation_id TEXT REFERENCES allocations(id),
        start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL, vehicle TEXT NOT NULL,
        plate TEXT NOT NULL, status TEXT NOT NULL, total INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS allocations_window ON allocations (space_id, start_time, end_time);
      CREATE INDEX IF NOT EXISTS bookings_window ON bookings (space_id, start_time, end_time);
      `);
      const { rows } = await client.query("SELECT id FROM spaces LIMIT 1");
      if (!rows.length) {
        for (const space of seedSpaces) {
          await client.query(
            `INSERT INTO spaces (id,owner,name,area,address,lat,lng,price,capacity,vehicle,covered,ev,instructions,kind)
           VALUES ($1,'demo',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            space,
          );
        }
      }
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtextextended('parkly-schema-init', 0))",
      );
      client.release();
    }
  };
  const available = async (spaceId, start, end, client = pool) => {
    const space = await client.query("SELECT * FROM spaces WHERE id=$1", [
      spaceId,
    ]);
    if (!space.rows[0] || space.rows[0].status !== "active") return 0;
    if (
      (
        await client.query(
          "SELECT id FROM space_blocks WHERE space_id=$1 AND start_time<$2 AND end_time>$3",
          [spaceId, new Date(end).toISOString(), new Date(start).toISOString()],
        )
      ).rows.length
    )
      return 0;
    const allocations = await client.query(
      "SELECT count(*)::int AS n FROM allocations WHERE space_id=$1 AND start_time < $2 AND end_time > $3",
      [spaceId, end, start],
    );
    const bookings = await client.query(
      "SELECT count(*)::int AS n FROM bookings WHERE space_id=$1 AND event_id IS NULL AND status <> 'cancelled' AND start_time < $2 AND end_time > $3",
      [spaceId, end, start],
    );
    return Math.max(
      0,
      space.rows[0].capacity - allocations.rows[0].n - bookings.rows[0].n,
    );
  };
  const book = async ({
    session,
    spaceId,
    eventId,
    start,
    end,
    vehicle,
    plate,
  }) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('parkly-inventory', 0))",
      );
      let allocation = null;
      let space;
      if (eventId) {
        const event = (
          await client.query("SELECT * FROM events WHERE id=$1", [eventId])
        ).rows[0];
        if (!event) throw Error("Event not found.");
        start = event.start_time;
        end = event.end_time;
        const existing = await client.query(
          "SELECT id FROM bookings WHERE event_id=$1 AND (session=$2 OR plate=$3) AND status <> 'cancelled'",
          [eventId, session, plate],
        );
        if (existing.rows.length)
          throw Error(
            "A parking pass has already been claimed for this guest or vehicle.",
          );
        const options = await client.query(
          `SELECT a.id AS allocation_id,a.space_id,s.* FROM allocations a JOIN spaces s ON s.id=a.space_id
           WHERE a.event_id=$1 AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.allocation_id=a.id AND b.status <> 'cancelled')
           ORDER BY a.id`,
          [eventId],
        );
        space = options.rows.find((candidate) => fits(candidate, vehicle));
        if (space)
          allocation = { id: space.allocation_id, space_id: space.space_id };
        if (!space) throw Error("No compatible spaces remain for this event.");
      } else {
        space = (
          await client.query("SELECT * FROM spaces WHERE id=$1", [spaceId])
        ).rows[0];
        if (!space || space.status !== "active" || !fits(space, vehicle))
          throw Error("This space does not fit your vehicle.");
        if (!(await available(spaceId, start, end, client)))
          throw Error("This space was just booked. Please choose another.");
      }
      const duplicate = await client.query(
        "SELECT id FROM bookings WHERE session=$1 AND plate=$2 AND status <> 'cancelled' AND start_time < $3 AND end_time > $4",
        [session, plate, end, start],
      );
      if (duplicate.rows.length)
        throw Error("This vehicle already has a booking during that time.");
      const booking = {
        id: randomUUID(),
        session,
        space_id: space.id || space.space_id,
        event_id: eventId || null,
        allocation_id: allocation?.id || null,
        start_time: start,
        end_time: end,
        vehicle,
        plate,
        status: "confirmed",
        total: eventId ? 0 : quote(space, start, end).total,
      };
      await client.query(
        `INSERT INTO bookings (id,session,space_id,event_id,allocation_id,start_time,end_time,vehicle,plate,status,total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        Object.values(booking),
      );
      await client.query("COMMIT");
      return { ...booking, start: booking.start_time, end: booking.end_time };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  const createEvent = async ({
    session,
    name,
    venue,
    start,
    end,
    quantity,
    spaceIds,
  }) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('parkly-inventory', 0))",
      );
      const chosen = [];
      for (const id of [...new Set(spaceIds)]) {
        for (
          let i = 0, count = await available(id, start, end, client);
          i < count && chosen.length < quantity;
          i++
        )
          chosen.push(id);
      }
      if (chosen.length < quantity)
        throw Error(
          "Not enough available spaces. Reduce the quantity or add locations.",
        );
      const id = randomUUID();
      await client.query(
        "INSERT INTO events (id,owner,name,venue,start_time,end_time,quantity) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id, session, name, venue, start, end, quantity],
      );
      for (const spaceId of chosen)
        await client.query(
          "INSERT INTO allocations (id,space_id,event_id,start_time,end_time) VALUES ($1,$2,$3,$4,$5)",
          [randomUUID(), spaceId, id, start, end],
        );
      await client.query("COMMIT");
      return id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  return { pool, init, book, createEvent, available };
}
