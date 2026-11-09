// Production wiring: real SERV, real kpass, file store.

import { createBuyer } from "./buy.js";
import { createKpass } from "./kpass.js";
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

export function createTare({ storePath = STORE_PATH, kpassBin, onKpassRaw } = {}) {
  const store = fileStore(storePath);
  let complete; // created lazily so refused buys work without a key
  const extract = (prose) => {
    complete ??= createServComplete({ apiKey: process.env.SERV_API_KEY });
    return extractClaims(prose, { complete });
  };
  const buyer = createBuyer({
    store,
    kpass: withRawLog(createKpass({ bin: kpassBin }), onKpassRaw),
    extract,
    promptSha256: PROMPT_SHA256,
  });
  return { store, buy: buyer.buy };
}

// Hand every raw kpass output to a logger (the CLI writes it to data/kpass_raw.log).
function withRawLog(kpass, onRaw) {
  if (!onRaw) return kpass;
  return {
    async execute(url) {
      try {
        const res = await kpass.execute(url);
        onRaw(res.raw);
        return res;
      } catch (err) {
        onRaw(`ERROR: ${err?.message ?? err}`);
        throw err;
      }
    },
  };
}
