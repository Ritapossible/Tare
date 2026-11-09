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
  };
}
