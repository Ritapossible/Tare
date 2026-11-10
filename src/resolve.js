// Resolve a payment whose outcome Tare could not see (status "pending": a timeout or network error
// after signing). Only a person can do this, after checking the payer's wallet on the explorer.
//
//   not settled → status "failed"; the seller is no longer refused for this payment.
//   settled     → status "paid_unchecked" with the hash the person found. It is marked
//                 tx_hash_source: "operator", because Tare never received it from the seller.
// The seller's record is not changed either way: an unseen outcome is not the seller's fault.

import { isTxHash } from "./txhash.js";

export function resolvePending(store, receiptId, { settled, txHash = null, now = () => new Date().toISOString() }) {
  const r = store.receipts().find((x) => x.id === receiptId);
  if (!r) throw new Error(`no receipt ${receiptId}`);
  if (r.status !== "pending") throw new Error(`receipt ${receiptId} is ${r.status}, not pending`);
  if (settled) {
    if (!isTxHash(txHash)) throw new Error("a settled payment needs the real 0x + 64 hex transaction hash from the explorer");
    return store.put({
      ...r,
      status: "paid_unchecked",
      tx_hash: txHash,
      tx_hash_source: "operator",
      error: `${r.error ?? "outcome unknown"}; resolved by operator at ${now()}: settled on-chain, delivery not received`,
    });
  }
  if (txHash) throw new Error("a hash only makes sense for a settled payment");
  return store.put({
    ...r,
    status: "failed",
    error: `${r.error ?? "outcome unknown"}; resolved by operator at ${now()}: no settlement found on-chain`,
  });
}
