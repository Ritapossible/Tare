// Tare as a library.
//
//   import { verify, tareFetch } from "tare";
//   const r = await verify(sellerText, rows);   // { verdict: "clean" | "dispute" | "unverifiable", ... }
//   const receipt = await tareFetch(sellerUrl);  // pay, check, record; refuses held sellers
//
// verify() never pays and never sees a wallet: it reads the seller's text with SERV and checks the
// rows in code. tareFetch() is the full buyer (payment rail, local seller records, trusted feeds).

import { extractClaims, createServComplete } from "./serv.js";
import { check, shapeFailure } from "./check.js";
import { PROMPT_SHA256 } from "./prompt.js";
import { createTare } from "./tare.js";

export { check, parseBody, measure, RULES } from "./check.js";
export { ground, extractClaims, ServError } from "./serv.js";
export { PROMPT_SHA256, FRESHNESS_PROMPT_SHA256 } from "./prompt.js";

const isRows = (rows) => Array.isArray(rows) && rows.every((r) => r !== null && typeof r === "object" && !Array.isArray(r));

// promise: the seller's own words (its 402 description or delivery note). rows: the delivered records.
// SERV errors are thrown (ServError, code SERV_INVALID or SERV_API): no check happened, so there is
// no verdict to return.
export async function verify(promise, rows, { complete, apiKey = process.env.SERV_API_KEY, now = Date.now() } = {}) {
  if (typeof promise !== "string") throw new TypeError("verify: promise must be the seller's text (a string)");
  if (!isRows(rows)) {
    return { ...shapeFailure(), claims: null, notes: [], prompt_sha256: PROMPT_SHA256 };
  }
  const read = await extractClaims(promise, { complete: complete ?? createServComplete({ apiKey }) });
  const result = check(rows, read.claims, { now });
  return {
    verdict: result.verdict,
    failed: result.failed,
    claims: read.claims,
    count: result.count,
    unique_count: result.unique_count,
    oldest_age_hours: result.oldest_age_hours ?? null,
    notes: read.notes ?? [],
    prompt_sha256: PROMPT_SHA256,
  };
}

// Pay a seller over x402 (Kite testnet), check the delivery, record the result. Returns the receipt.
// A seller held locally or in a trusted feed is refused before any payment is attempted.
export async function tareFetch(url, { requestId, allowFeedHold = false, ...options } = {}) {
  return createTare(options).buy(url, { requestId, allowFeedHold });
}
