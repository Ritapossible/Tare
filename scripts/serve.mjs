// Live console: node scripts/serve.mjs  (or npm run app)  →  http://127.0.0.1:4020
import { readFileSync } from "node:fs";
import { createApp } from "../src/server.js";
import { createTare, loadEnv } from "../src/tare.js";
import { assertDistinctOrigins } from "../src/config.js";
import { appendFileSync, mkdirSync } from "node:fs";

loadEnv();

const sellers = JSON.parse(readFileSync("sellers.json", "utf8"));
const configured = Object.fromEntries(Object.entries(sellers).filter(([, v]) => v));
if (Object.keys(configured).length > 1) assertDistinctOrigins(configured);

const tare = createTare({
  onKpassRaw: (raw) => {
    mkdirSync("data", { recursive: true });
    appendFileSync("data/kpass_raw.log", `\n===== ${new Date().toISOString()}\n${raw}\n`);
  },
});

const port = Number(process.env.PORT ?? 4020);
createApp({ tare, sellers, webRoot: "web" }).listen(port, "127.0.0.1", () => {
  console.log(`Tare console: http://127.0.0.1:${port}/app`);
  if (!Object.keys(configured).length) console.log("sellers.json has no URLs yet: Buy is disabled until the sellers are deployed.");
});
