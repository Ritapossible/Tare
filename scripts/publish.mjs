// Copy the local run into web/data/state.json for the hosted (read-only) site.
//   node scripts/publish.mjs
// Refuses to publish if any receipt carries a tx_hash that is not a 0x + 64 hex value, so test
// fixtures or a parser bug can never put a fake-looking hash on the public page.
import { readFileSync, writeFileSync } from "node:fs";
import { fileStore } from "../src/store.js";
import { STORE_PATH } from "../src/tare.js";
import { buildState } from "../src/state.js";

const TX = /^0x[0-9a-fA-F]{64}$/;

export function validateForPublish(state) {
  const bad = state.receipts.filter((r) => r.tx_hash !== null && r.tx_hash !== undefined && !TX.test(r.tx_hash));
  if (bad.length) throw new Error(`refusing to publish: ${bad.length} receipt(s) with a malformed tx_hash (${bad.map((r) => r.id).join(", ")})`);
  const pending = state.receipts.filter((r) => r.status === "pending");
  if (pending.length) throw new Error(`refusing to publish: ${pending.length} pending receipt(s); resolve them first`);
  return state;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sellers = JSON.parse(readFileSync("sellers.json", "utf8"));
  const state = validateForPublish(buildState({ store: fileStore(STORE_PATH), sellers, mode: "published" }));
  writeFileSync("web/data/state.json", JSON.stringify(state, null, 2) + "\n");
  console.log(`published ${state.receipts.length} receipt(s) to web/data/state.json. Commit and push to update the hosted site.`);
}
