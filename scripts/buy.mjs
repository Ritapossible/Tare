// Buy from a seller through Tare.
//
//   node scripts/buy.mjs a                      # seller A from sellers.json
//   node scripts/buy.mjs b --request-id demo-1  # replaying the same id never pays twice
//   node scripts/buy.mjs https://host/v1/...    # any URL
//
// Every raw payment output is appended to data/kpass_raw.log so the parser can be checked.

import { createTare, loadEnv, appendRawLog } from "../src/tare.js";
import { loadSellers } from "../src/config.js";
import { isTxHash, noHashLabel } from "../web/assets/render.js";

loadEnv();

const [target, ...rest] = process.argv.slice(2);
if (!target) {
  console.error("usage: node scripts/buy.mjs <a|b|url> [--request-id ID] [--allow-feed-hold]");
  process.exit(2);
}
const idIdx = rest.indexOf("--request-id");
const requestId = idIdx >= 0 ? rest[idIdx + 1] : undefined;
if (idIdx >= 0 && !/^[A-Za-z0-9_-]{1,100}$/.test(requestId ?? "")) {
  console.error("--request-id needs a value of letters, digits, '-' or '_' (max 100)");
  process.exit(2);
}
// A seller held in a trusted feed is stopped unless the operator passes this flag on purpose.
const allowFeedHold = rest.includes("--allow-feed-hold");

let url = target;
let sellers = null;
if (!/^https?:\/\//.test(target)) {
  try {
    // Only the seller being bought needs a URL: buying A must work before B is deployed.
    sellers = loadSellers("sellers.json", { requireAll: false });
    url = sellers[target];
  } catch (err) {
    console.error(`${err.message}\nDeploy the sellers (sellers/README.md) and fill sellers.json, or pass a full URL.`);
    process.exit(2);
  }
}
if (!url) {
  console.error(sellers && target in sellers ? `seller "${target}" has no URL in sellers.json yet` : `unknown seller "${target}" (use a, b or a URL)`);
  process.exit(2);
}

const tare = createTare({ onKpassRaw: appendRawLog });

const r = await tare.buy(url, { requestId, allowFeedHold });
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
for (const note of r.feed_notes ?? []) show("feed", note);
show("payments", `${tare.store.kpassCalls()} attempted (rail: ${process.env.TARE_PAYMENT_RAIL || "kpass"})`);
