// Human override: release a held seller (e.g. after reviewing an "unverifiable" hold).
// Internally this removes the origin from the store's blocklist.
//   node scripts/unblock.mjs https://seller-host.example
import { fileStore } from "../src/store.js";
import { STORE_PATH } from "../src/tare.js";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/unblock.mjs <seller origin or URL>");
  process.exit(2);
}
const origin = new URL(arg).origin;
const removed = fileStore(STORE_PATH).unblock(origin);
console.log(removed ? `released ${origin}: back in good standing` : `${origin} was not held`);
