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

export function createTare({ storePath = STORE_PATH, kpassBin, onKpassRaw, rail } = {}) {
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
  });
  return { store, buy: buyer.buy };
}

// Hand every raw kpass output to a logger (the CLI writes it to data/kpass_raw.log).
function withRawLog(kpass, onRaw) {
  if (!onRaw) return kpass;
  return {
    async execute(url, opts) {
      try {
        const res = await kpass.execute(url, opts);
        onRaw(res.raw);
        return res;
      } catch (err) {
        onRaw(`ERROR: ${err?.message ?? err}`);
        throw err;
      }
    },
  };
}
