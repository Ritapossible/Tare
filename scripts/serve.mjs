// Live console: node scripts/serve.mjs  (or npm run app)  →  http://127.0.0.1:4020
import { createApp } from "../src/server.js";
import { createTare, loadEnv, appendRawLog } from "../src/tare.js";
import { loadSellers } from "../src/config.js";

loadEnv();

// Sellers without a URL yet are shown as "not deployed"; the ones that have one must not share an origin.
const sellers = loadSellers("sellers.json", { requireAll: false });
const configured = Object.values(sellers).filter(Boolean).length;

const tare = createTare({ onKpassRaw: appendRawLog });

const port = Number(process.env.PORT ?? 4020);
createApp({ tare, sellers, webRoot: "web" }).listen(port, "127.0.0.1", () => {
  console.log(`Tare console: http://127.0.0.1:${port}/app`);
  if (!configured) console.log("sellers.json has no URLs yet: Buy is disabled until the sellers are deployed.");
});
