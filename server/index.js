import "dotenv/config";
import { mkdirSync } from "node:fs";
import { createStore } from "./store.js";
import { createNeonStore } from "./neon-store.js";
import { createApp } from "./app.js";
mkdirSync("data", { recursive: true });
const store = process.env.DATABASE_URL
  ? createNeonStore()
  : createStore("data/parkly.sqlite");
if (store.init) await store.init();
const app = await createApp(store);
const port = Number(process.env.PORT || 3001);
app.listen(port, process.env.DATABASE_URL ? "0.0.0.0" : "127.0.0.1", () =>
  console.log(`Parkly API listening on ${port}`),
);
