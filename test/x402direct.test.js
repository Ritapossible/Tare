import { test } from "node:test";
import assert from "node:assert/strict";
import { createX402Direct, checkRequirement, KITE_TESTNET, DEFAULT_CAPS } from "../src/x402direct.js";
import { TEST_TX } from "./helpers.js";

// A throwaway key used only inside these tests; it never holds funds and never touches a network.
const TEST_KEY = "0x" + "11".repeat(32);
const FAKE_TX = TEST_TX; // obviously fake ("7e57" = test), valid shape only

const req = (over = {}) => ({
  scheme: "exact",
  network: KITE_TESTNET.network,
  amount: "1000000000000000", // 0.001 pieUSD
  asset: KITE_TESTNET.asset,
  payTo: "0x9Ef47eA89403c6a2637271B655b0C5b99c68C447",
  maxTimeoutSeconds: 60,
  extra: { name: "pieUSD", version: "1" },
  ...over,
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");

// A fake x402 seller: 402 + PAYMENT-REQUIRED until a PAYMENT-SIGNATURE arrives, then 200.
function fakeSeller({ accepts = [req()], settle = { success: true, transaction: FAKE_TX, network: KITE_TESTNET.network } } = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    const signed = headers.get("payment-signature");
    calls.push({ signed: Boolean(signed), payload: signed ? JSON.parse(Buffer.from(signed, "base64").toString()) : null });
    if (!signed) {
      return new Response('{"error":"Payment required"}', {
        status: 402,
        headers: { "content-type": "application/json", "PAYMENT-REQUIRED": b64({ x402Version: 2, error: "Payment required", resource: { url: String(input) }, accepts }) },
      });
    }
    const h = { "content-type": "application/json" };
    if (settle) h["PAYMENT-RESPONSE"] = b64(settle);
    return new Response('{"prose":"x","rows":[]}', { status: 200, headers: h });
  };
  return { calls, fetchImpl };
}

function ledger(start = 0n) {
  let spent = start;
  return { spent: () => spent, add: (u) => (spent += u), get value() { return spent; } };
}

test("pays testnet pieUSD within caps and returns the settlement hash", async () => {
  const seller = fakeSeller();
  const l = ledger();
  const rail = createX402Direct({ privateKey: TEST_KEY, ledger: l, fetchImpl: seller.fetchImpl });
  const r = await rail.execute("https://seller.test/v1/b.json");
  assert.equal(r.status, 200);
  assert.equal(r.paymentHash, FAKE_TX);
  assert.equal(r.bodyText, '{"prose":"x","rows":[]}');
  assert.equal(l.value, 1000000000000000n);
  assert.equal(seller.calls.length, 2);
  const auth = seller.calls[1].payload.payload.authorization;
  assert.equal(auth.to.toLowerCase(), req().payTo.toLowerCase());
  assert.equal(auth.value, "1000000000000000");
  assert.match(seller.calls[1].payload.payload.signature, /^0x[0-9a-f]+$/i);
});

test("never signs for a different network (e.g. mainnet USDC.e)", async () => {
  const seller = fakeSeller({ accepts: [req({ network: "eip155:2366", asset: "0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e", amount: "1000" })] });
  const rail = createX402Direct({ privateKey: TEST_KEY, ledger: ledger(), fetchImpl: seller.fetchImpl });
  await assert.rejects(() => rail.execute("https://seller.test/v1/b.json"));
  assert.ok(seller.calls.every((c) => !c.signed), "no payment may be signed");
});

test("never signs above the per-payment cap", async () => {
  const seller = fakeSeller({ accepts: [req({ amount: (DEFAULT_CAPS.perPayment + 1n).toString() })] });
  const rail = createX402Direct({ privateKey: TEST_KEY, ledger: ledger(), fetchImpl: seller.fetchImpl });
  await assert.rejects(() => rail.execute("https://seller.test/v1/b.json"));
  assert.ok(seller.calls.every((c) => !c.signed));
});

test("never signs once the total cap would be exceeded", async () => {
  const seller = fakeSeller();
  const l = ledger(DEFAULT_CAPS.total - 1n);
  const rail = createX402Direct({ privateKey: TEST_KEY, ledger: l, fetchImpl: seller.fetchImpl });
  await assert.rejects(() => rail.execute("https://seller.test/v1/b.json"), /total cap/);
  assert.ok(seller.calls.every((c) => !c.signed));
  assert.equal(l.value, DEFAULT_CAPS.total - 1n);
});

test("no PAYMENT-RESPONSE → null hash, never invented", async () => {
  const seller = fakeSeller({ settle: null });
  const rail = createX402Direct({ privateKey: TEST_KEY, ledger: ledger(), fetchImpl: seller.fetchImpl });
  const r = await rail.execute("https://seller.test/v1/b.json");
  assert.equal(r.status, 200);
  assert.equal(r.paymentHash, null);
});

test("checkRequirement covers scheme, network, asset, amount and caps", () => {
  const ok = { spent: 0n };
  assert.equal(checkRequirement(req(), ok), null);
  assert.match(checkRequirement(req({ scheme: "upto" }), ok), /scheme/);
  assert.match(checkRequirement(req({ network: "eip155:8453" }), ok), /network/);
  assert.match(checkRequirement(req({ asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }), ok), /asset/);
  assert.match(checkRequirement(req({ amount: "abc" }), ok), /integer/);
  assert.match(checkRequirement(req({ amount: "0" }), ok), /positive/);
  assert.equal(checkRequirement(req({ asset: KITE_TESTNET.asset.toLowerCase() }), ok), null);
});
