// Wipe the local store (receipts, blocklist, idempotency, kpass call count) for a clean demo take.
// Does not touch data/kpass_raw.log.
import { fileStore } from "../src/store.js";
import { STORE_PATH } from "../src/tare.js";

fileStore(STORE_PATH).reset();
console.log(`reset ${STORE_PATH}`);
