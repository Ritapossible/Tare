// Wipe the local store (receipts, seller holds, idempotency, payment call count) for a clean demo
// take. Keeps the direct-rail lifetime spend ledger (so the 1 pieUSD cap is never reset) and does
// not touch data/kpass_raw.log or the testnet key.
import { fileStore } from "../src/store.js";
import { STORE_PATH } from "../src/tare.js";

fileStore(STORE_PATH).reset();
console.log(`reset ${STORE_PATH}`);
