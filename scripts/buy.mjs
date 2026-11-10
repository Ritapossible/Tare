// Buy from a seller through Tare.
//
//   node scripts/buy.mjs a                      # seller A from sellers.json
//   node scripts/buy.mjs b --request-id demo-1  # replaying the same id never pays twice
//   node scripts/buy.mjs https://host/v1/...    # any URL
//
// Every raw kpass output is appended to data/kpass_raw.log so the parser can be checked.

import { appendFileSync, mkdirSync } from "node:fs";
import { createTare, loadEnv } from "../src/tare.js";
import { loadSellers } from "../src/config.js";
import { isTxHash, noHashLabel } from "../web/assets/render.js";

loadEnv();

const [target, ...rest] = process.argv.slice(2);
if (!target) {
  console.error("usage: node scripts/buy.mjs <a|b|url> [--request-id ID]");
  process.exit(2);
}
const idIdx = rest.indexOf("--request-id");
const requestId = idIdx >= 0 ? rest[idIdx + 1] : undefined;

let url = target;
if (!/^https?:\/\//.test(target)) {
  try {
    url = loadSellers()[target];
  } catch (err) {
    console.error(`${err.message}\nDeploy the sellers (sellers/README.md) and fill sellers.json, or pass a full URL.`);
    process.exit(2);
  }
}
if (!url) {
  console.error(`unknown seller "${target}" (use a, b or a URL)`);
  process.exit(2);
}

const tare = createTare({
  onKpassRaw: (raw) => {
    mkdirSync("data", { recursive: true });
    appendFileSync("data/kpass_raw.log", `\n===== ${new Date().toISOString()} ${url}\n${raw}\n`);
  },
});

const r = await tare.buy(url, { requestId });
const show = (k, v) => console.log(`${k.padEnd(12)}: ${v}`);
show("origin", r.origin);
show("status", r.status + (r.replayed ? " (replayed, no new payment)" : ""));
show("promised", r.claims ? JSON.stringify(r.claims) : "-");
show("delivered", r.count ?? "-");
show("unique", r.unique_count ?? "-");
show("failed", r.failed?.length ? r.failed.join(", ") : "-");
show("tx hash", isTxHash(r.tx_hash) ? r.tx_hash : noHashLabel(r.status));
const record = tare.store.blockEntry(r.origin);
show("record", record ? `held (${record.reason})` : "in good standing");
if (r.reason) show("reason", r.reason);
if (r.error) show("error", r.error);
show("payments", `${tare.store.kpassCalls()} attempted (rail: ${process.env.TARE_PAYMENT_RAIL || "kpass"})`);
