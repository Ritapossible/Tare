// Resolve a pending payment after checking the payer's wallet on the Kite testnet explorer.
//
//   node scripts/resolve.mjs                         # list pending receipts
//   node scripts/resolve.mjs <receipt id> not-paid   # nothing settled
//   node scripts/resolve.mjs <receipt id> paid <tx hash from the explorer>
import { fileStore } from "../src/store.js";
import { STORE_PATH } from "../src/tare.js";
import { resolvePending } from "../src/resolve.js";

const store = fileStore(STORE_PATH);
const [id, outcome, hash] = process.argv.slice(2);

if (!id) {
  const pending = store.receipts().filter((r) => r.status === "pending");
  if (!pending.length) console.log("no pending payments");
  for (const r of pending) console.log(`${r.id}  ${r.origin}  ${r.created_at}  ${r.error ?? ""}`);
  process.exit(0);
}
if (outcome !== "paid" && outcome !== "not-paid") {
  console.error("usage: node scripts/resolve.mjs <receipt id> not-paid | paid <tx hash>");
  process.exit(2);
}
try {
  const r = resolvePending(store, id, { settled: outcome === "paid", txHash: hash ?? null });
  console.log(`${r.id}: now ${r.status}${r.tx_hash ? ` (${r.tx_hash}, entered by operator)` : ""}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
