// The one state shape the web app reads, whether live (/api/state) or published (web/data/state.json).
import { SELLER_A_PROSE, SELLER_B_PROSE } from "../sellers/generate.mjs";
import { PROMPT_SHA256, SERV_MODEL } from "./prompt.js";

export const SELLER_LABELS = { a: SELLER_A_PROSE, b: SELLER_B_PROSE };

export function buildState({ store, sellers, mode, now = () => new Date().toISOString() }) {
  const snap = store.snapshot();
  return {
    mode,
    generated_at: now(),
    model: SERV_MODEL,
    prompt_sha256: PROMPT_SHA256,
    sellers: { ...sellers },
    seller_labels: SELLER_LABELS,
    receipts: snap.receipts,
    blocklist: snap.blocklist,
    kpass_calls: snap.kpass_calls,
    payment_rail: runRail(snap.receipts),
  };
}

// The rail is a fact of the run, recorded on each receipt when it was paid; publishing never reads
// it from the environment. Latest receipt that carries one wins; none recorded → null.
export function runRail(receipts = []) {
  for (let i = receipts.length - 1; i >= 0; i--) if (receipts[i]?.payment_rail) return receipts[i].payment_rail;
  return null;
}
