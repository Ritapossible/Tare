// Production wiring: real SERV, real kpass, file store.

import { createBuyer, paymentKey } from "./buy.js";
import { randomUUID } from "node:crypto";
import { createKpass } from "./kpass.js";
import { createX402Direct } from "./x402direct.js";
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { extractClaims, createServComplete } from "./serv.js";
import { fileStore } from "./store.js";
import { PROMPT_SHA256 } from "./prompt.js";
import { createFeedChecker, parseFeedList } from "./feeds.js";
import { createKiteDirectory } from "./identity.js";
import { explainReceipt } from "./explain.js";

export const STORE_PATH = "data/store.json";

export function loadEnv() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env; use the real environment
  }
}

export const X402_KEY_PATH = "data/x402-testnet.key";

// Unpaid GET to read the seller's own description from its 402 PAYMENT-REQUIRED header.
export async function readAdvertisement(url, { fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  const res = await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
  if (res.status !== 402) return { description: null, note: `no 402 advertisement (HTTP ${res.status})` };
  const header = res.headers.get("payment-required");
  if (!header) return { description: null, note: "402 without a PAYMENT-REQUIRED header" };
  let challenge;
  try {
    challenge = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return { description: null, note: "PAYMENT-REQUIRED header is not base64 JSON" };
  }
  const d = challenge?.resource?.description ?? challenge?.accepts?.[0]?.description ?? null;
  const description = typeof d === "string" && d.trim() ? d.trim().slice(0, 500) : null;
  return { description, note: description ? null : "the 402 carries no description" };
}

// TARE_PAYMENT_RAIL: "kpass" (default, Kite Passport) or "x402-direct" (testnet key, Pieverse facilitator).
export function createRail({ rail = process.env.TARE_PAYMENT_RAIL || "kpass", store, kpassBin, keyPath = X402_KEY_PATH } = {}) {
  if (rail === "x402-direct") {
    const privateKey = readFileSync(keyPath, "utf8").trim();
    return createX402Direct({ privateKey, ledger: { spent: () => store.directSpent(), add: (u) => store.addDirectSpent(u) } });
  }
  if (rail !== "kpass") throw new Error(`unknown TARE_PAYMENT_RAIL "${rail}" (kpass or x402-direct)`);
  return createKpass({ bin: kpassBin });
}

export function createTare({
  storePath = STORE_PATH,
  kpassBin,
  onKpassRaw,
  rail = process.env.TARE_PAYMENT_RAIL || "kpass",
  feeds = parseFeedList(process.env.TARE_FEEDS),
  payFeeds = process.env.TARE_PAY_FEEDS === "1",
  identity = process.env.TARE_KITE_DIRECTORY !== "0", // look sellers up in Kite's agent directory
} = {}) {
  const store = fileStore(storePath);
  let complete; // created lazily so refused buys work without a key
  const extract = (prose) => {
    complete ??= createServComplete({ apiKey: process.env.SERV_API_KEY });
    return extractClaims(prose, { complete });
  };
  // One rail instance pays for everything, so feed lookups and buys share the same spending caps.
  const payer = withRawLog(createRail({ rail, store, kpassBin }), onKpassRaw);
  // Paid feeds (opt-in): each lookup is a fresh payment with its own idempotency key.
  const payFetch = payFeeds ? (u) => payer.execute(u, { idempotencyKey: paymentKey(`feed|${u}|${randomUUID()}`) }) : null;
  const buyer = createBuyer({
    store,
    kpass: payer,
    extract,
    promptSha256: PROMPT_SHA256,
    paymentRail: rail,
    // TARE_FEEDS: comma-separated records.json URLs the operator chooses to trust (opt-in).
    feedCheck: feeds.length ? createFeedChecker({ feeds, payFetch }) : null,
    readAdvertisement: (u) => readAdvertisement(u),
    findIdentity: identity ? createKiteDirectory() : null,
    explain: (receipt) => {
      complete ??= createServComplete({ apiKey: process.env.SERV_API_KEY });
      return explainReceipt(receipt, { complete });
    },
  });
  return { store, buy: buyer.buy };
}

// Hand every raw payment output to a logger (the CLI writes it to data/kpass_raw.log).
// Logging is best effort: a logger failure must never change the payment outcome, because a
// settled payment recorded as "failed" would lose its hash and could be paid again.
// The CLI and the live console both append raw payment output here, with the seller URL.
export const RAW_LOG_PATH = "data/kpass_raw.log";
export function appendRawLog(raw, url, path = RAW_LOG_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `\n===== ${new Date().toISOString()} ${url ?? ""}\n${raw}\n`);
}

export function withRawLog(rail, onRaw) {
  if (!onRaw) return rail;
  const log = (text, url) => {
    try {
      onRaw(text, url);
    } catch (err) {
      console.error(`warning: could not write the raw payment log: ${err?.message ?? err}`);
    }
  };
  return {
    ...rail,
    async execute(url, opts) {
      let res;
      try {
        res = await rail.execute(url, opts);
      } catch (err) {
        log(`ERROR: ${err?.message ?? err}`, url);
        throw err;
      }
      log(res.raw, url);
      return res;
    },
  };
}
