// Publish the local run for the hosted (read-only) site:
//   web/data/state.json   receipts for the console
//   web/records.json      the seller-records feed other agents may choose to trust
//   web/badges/<host>.svg "Verified by Tare" badges, ONLY for sellers verified and in good standing
//
//   node scripts/publish.mjs
//
// Refuses to publish if any receipt carries a tx_hash that is not a 0x + 64 hex value, or if any
// payment is still pending, so a fake-looking hash or an unresolved payment never reaches the page.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileStore } from "../src/store.js";
import { STORE_PATH } from "../src/tare.js";
import { buildState } from "../src/state.js";
import { buildRecords, badgeEligible, badgeFileName, badgeSvg } from "../src/records.js";
import { TX_HASH as TX } from "../src/txhash.js";
import { signFeed } from "../src/identity.js";
import { loadPublisher } from "../src/publisher.js";

export function validateForPublish(state) {
  const bad = state.receipts.filter((r) => r.tx_hash !== null && r.tx_hash !== undefined && !TX.test(r.tx_hash));
  if (bad.length) throw new Error(`refusing to publish: ${bad.length} receipt(s) with a malformed tx_hash (${bad.map((r) => r.id).join(", ")})`);
  const pending = state.receipts.filter((r) => r.status === "pending");
  if (pending.length) throw new Error(`refusing to publish: ${pending.length} pending receipt(s); resolve them first`);
  return state;
}

// Writes the badge directory so it holds exactly the eligible sellers' badges (stale ones removed).
export function writeBadges(records, dir) {
  mkdirSync(dir, { recursive: true });
  const wanted = new Map(records.filter(badgeEligible).map((r) => [badgeFileName(r.origin), badgeSvg(r)]));
  for (const f of readdirSync(dir)) if (f.endsWith(".svg") && !wanted.has(f)) rmSync(join(dir, f));
  for (const [name, svg] of wanted) writeFileSync(join(dir, name), svg);
  return [...wanted.keys()];
}

// signer (optional): { privateKey, did } — the publisher identity that signs records.json.
export async function publish({ store, sellers, webDir = "web", signer = null }) {
  const state = validateForPublish(buildState({ store, sellers, mode: "published" }));
  let feed = buildRecords(store.snapshot());
  if (signer) feed = await signFeed(feed, signer.privateKey, { did: signer.did ?? null });
  mkdirSync(join(webDir, "data"), { recursive: true });
  writeFileSync(join(webDir, "data", "state.json"), JSON.stringify(state, null, 2) + "\n");
  writeFileSync(join(webDir, "records.json"), JSON.stringify(feed, null, 2) + "\n");
  const badges = writeBadges(feed.records, join(webDir, "badges"));
  return { state, feed, badges };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sellers = JSON.parse(readFileSync("sellers.json", "utf8"));
  const signer = loadPublisher();
  const { state, feed, badges } = await publish({ store: fileStore(STORE_PATH), sellers, signer });
  console.log(`published ${state.receipts.length} receipt(s) → web/data/state.json`);
  console.log(`published ${feed.records.length} seller record(s) → web/records.json`);
  console.log(`badges: ${badges.length ? badges.join(", ") : "none"} → web/badges/`);
  console.log(feed.signature ? `records.json signed by ${feed.signature.signer}${feed.signature.did ? ` (${feed.signature.did})` : ""}` : "records.json NOT signed (run node scripts/identity.mjs to create a publisher key)");
  console.log("Commit and push to update the hosted site.");
}
