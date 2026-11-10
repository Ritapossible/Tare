import { test } from "node:test";
import assert from "node:assert/strict";
import { plainError, settlementCell } from "../web/assets/render.js";
import { resolvePending } from "../src/resolve.js";
import { createBuyer } from "../src/buy.js";
import { memoryStore } from "../src/store.js";
import { B_URL, TEST_TX } from "./helpers.js";

test("plain sentences for every non-verdict outcome", () => {
  const cases = [
    [{ status: "pending" }, /could not tell whether this payment settled/],
    [{ status: "paid_unverified", error: "no PAYMENT-RESPONSE hash returned" }, /no settlement hash came back/],
    [{ status: "paid_unchecked", error: "SERV_INVALID: SERV returned invalid claims twice" }, /did not return a readable answer/],
    [{ status: "paid_unchecked", error: "SERV_API: SERV request failed: 401" }, /could not be reached/],
    [{ status: "failed", error: "payment: kpass exited with code 1: payment_target_forbidden: host_not_in_executable_catalog" }, /not in Kite's service catalog/],
    [{ status: "failed", error: "payment: Tare refused to sign: amount above cap" }, /refused to sign/],
    [{ status: "failed", error: "payment returned HTTP 502" }, /treats this as not paid/],
    [{ status: "dispute", error: "seller returned HTTP 500 after settlement" }, /hash is kept and the seller is held/],
  ];
  for (const [r, want] of cases) assert.match(plainError(r), want, JSON.stringify(r));
  assert.equal(plainError({ status: "clean" }), null);
  assert.equal(plainError({ status: "refused", reason: "seller held" }), null);
});

async function pendingReceipt() {
  const store = memoryStore();
  const b = createBuyer({
    store,
    kpass: { execute: async () => { throw Object.assign(new Error("timed out"), { outcome: "unknown" }); } },
    extract: async () => ({ claims: {} }),
    promptSha256: "x",
  });
  const r = await b.buy(B_URL);
  assert.equal(r.status, "pending");
  return { store, b, r };
}

test("resolve: not paid → failed, and the seller can be bought again", async () => {
  const { store, b, r } = await pendingReceipt();
  assert.equal((await b.buy(B_URL)).status, "refused");
  const out = resolvePending(store, r.id, { settled: false });
  assert.equal(out.status, "failed");
  assert.match(plainError(out), /never settled/);
  assert.equal(store.pendingFor(new URL(B_URL).origin), null);
});

test("resolve: paid needs a real hash, which is marked as entered by the operator", async () => {
  const { store, r } = await pendingReceipt();
  assert.throws(() => resolvePending(store, r.id, { settled: true }), /0x \+ 64 hex/);
  assert.throws(() => resolvePending(store, r.id, { settled: true, txHash: "0xTEST_HASH" }), /0x \+ 64 hex/);
  const out = resolvePending(store, r.id, { settled: true, txHash: TEST_TX });
  assert.equal(out.status, "paid_unchecked");
  assert.equal(out.tx_hash_source, "operator");
  assert.match(settlementCell(out), /entered by the operator/);
  assert.match(plainError(out), /settled on-chain/);
  assert.throws(() => resolvePending(store, r.id, { settled: false }), /not pending/);
  assert.equal(store.blockEntry(new URL(B_URL).origin), null); // the seller's record is unchanged
});
