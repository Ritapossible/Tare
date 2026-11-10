import { readFileSync } from "node:fs";
import { createBuyer } from "../src/buy.js";
import { memoryStore } from "../src/store.js";
import { extractClaims } from "../src/serv.js";
import { PROMPT_SHA256 } from "../src/prompt.js";

export const A_URL = "https://seller-a.test/v1/a.json";
export const B_URL = "https://seller-b.test/v1/b.json";
export const A_ORIGIN = "https://seller-a.test";
export const B_ORIGIN = "https://seller-b.test";

export const BODY_A = readFileSync(new URL("../sellers/data/a.json", import.meta.url), "utf8");
export const BODY_B = readFileSync(new URL("../sellers/data/b.json", import.meta.url), "utf8");

// Obviously fake hashes. They exist only inside tests and never reach data/store.json.
// Hex-shaped stand-in for tests that need a syntactically valid hash: "7e57" spells "test".
// Never a real transaction, and never reaches the live store.
export const TEST_TX = "0x" + "7e57".repeat(16);
export const FAKE_HASH = { [A_URL]: "0xTEST_HASH_A", [B_URL]: "0xTEST_HASH_B" };

// Fake kpass: records every call. Behaviour per URL can be overridden.
export function fakeKpass(overrides = {}) {
  const calls = [];
  return {
    calls,
    async execute(url) {
      calls.push(url);
      if (overrides[url]) return overrides[url](url, calls.length);
      const bodyText = url.endsWith("a.json") ? BODY_A : BODY_B;
      return { status: 200, bodyText, paymentHash: FAKE_HASH[url] ?? "0xTEST_HASH", raw: "(fake)" };
    },
  };
}

// Fake SERV "complete" function: returns scripted raw strings in order, or a function of the prose.
export function fakeServ(script) {
  const prompts = [];
  let i = 0;
  const complete = async (messages) => {
    prompts.push(messages);
    if (typeof script === "function") return script(messages[1].content);
    const next = script[Math.min(i++, script.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  return { prompts, complete };
}

// An honest fake extractor: maps known prose to the claims a correct model would return.
export const HONEST = (userContent) => {
  if (userContent.includes("one thousand two hundred forty")) {
    return '{"claimed_count":1240,"unique":true,"fields":["id","ts"],"no_nulls":true}';
  }
  if (userContent.includes("two hundred records")) {
    return '{"claimed_count":200,"unique":null,"fields":["id","ts"],"no_nulls":true}';
  }
  return '{"claimed_count":null,"unique":null,"fields":null,"no_nulls":null}';
};

export function setup({ kpass = fakeKpass(), serv = fakeServ(HONEST), store = memoryStore() } = {}) {
  let n = 0;
  const buyer = createBuyer({
    store,
    kpass,
    extract: (prose) => extractClaims(prose, { complete: serv.complete }),
    promptSha256: PROMPT_SHA256,
    now: () => "2026-11-09T00:00:00.000Z",
    newId: () => `id${++n}`,
  });
  return { ...buyer, store, kpass, serv };
}
