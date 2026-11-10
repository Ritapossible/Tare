// Production wiring: real SERV, real kpass, file store.

import { createBuyer } from "./buy.js";
import { createKpass } from "./kpass.js";
import { createX402Direct } from "./x402direct.js";
import { readFileSync } from "node:fs";
import { extractClaims, createServComplete } from "./serv.js";
import { fileStore } from "./store.js";
import { PROMPT_SHA256 } from "./prompt.js";

export const STORE_PATH = "data/store.json";

export function loadEnv() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env; use the real environment
  }
}

export const X402_KEY_PATH = "data/x402-testnet.key";

// TARE_PAYMENT_RAIL: "kpass" (default, Kite Passport) or "x402-direct" (testnet key, Pieverse facilitator).
export function createRail({ rail = process.env.TARE_PAYMENT_RAIL || "kpass", store, kpassBin, keyPath = X402_KEY_PATH } = {}) {
  if (rail === "x402-direct") {
    const privateKey = readFileSync(keyPath, "utf8").trim();
    return createX402Direct({ privateKey, ledger: { spent: () => store.directSpent(), add: (u) => store.addDirectSpent(u) } });
  }
  if (rail !== "kpass") throw new Error(`unknown TARE_PAYMENT_RAIL "${rail}" (kpass or x402-direct)`);
  return createKpass({ bin: kpassBin });
}

export function createTare({ storePath = STORE_PATH, kpassBin, onKpassRaw, rail = process.env.TARE_PAYMENT_RAIL || "kpass" } = {}) {
  const store = fileStore(storePath);
  let complete; // created lazily so refused buys work without a key
  const extract = (prose) => {
    complete ??= createServComplete({ apiKey: process.env.SERV_API_KEY });
    return extractClaims(prose, { complete });
  };
  const buyer = createBuyer({
    store,
    kpass: withRawLog(createRail({ rail, store, kpassBin }), onKpassRaw),
    extract,
    promptSha256: PROMPT_SHA256,
    paymentRail: rail,
  });
  return { store, buy: buyer.buy };
}

// Hand every raw payment output to a logger (the CLI writes it to data/kpass_raw.log).
// Logging is best effort: a logger failure must never change the payment outcome, because a
// settled payment recorded as "failed" would lose its hash and could be paid again.
export function withRawLog(rail, onRaw) {
  if (!onRaw) return rail;
  const log = (text) => {
    try {
      onRaw(text);
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
        log(`ERROR: ${err?.message ?? err}`);
        throw err;
      }
      log(res.raw);
      return res;
    },
  };
}
