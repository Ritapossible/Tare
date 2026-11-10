import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, txCell, ruleRows, receiptRow, sellerName } from "../web/assets/render.js";
import { validateForPublish } from "../scripts/publish.mjs";
import { TEST_TX } from "./helpers.js";

const H = TEST_TX; // obviously fake ("7e57" = test), valid shape only

test("esc neutralises HTML from sellers and the model", () => {
  assert.equal(esc(`<img src=x onerror="alert(1)">'&`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;");
  assert.equal(esc(null), "");
});

test("a receipt row escapes every seller- or model-controlled value", () => {
  const evil = "<script>alert(1)</script>";
  const html = receiptRow(
    { id: `x"><b>`, origin: "https://a.test", status: evil, claims: { claimed_count: 1 }, count: 1, unique_count: 1, failed: [evil], tx_hash: evil },
    { sellers: {}, blocklist: {} },
  );
  assert.ok(!html.includes("<script>"), html);
  assert.ok(!html.includes('"><b>'));
});

test("only a 0x + 64 hex value renders as a hash; anything else is 'not paid'", () => {
  assert.match(txCell(H), /0x7e577e57…577e57/);
  for (const bad of [null, "", "0xTEST_HASH_A", "pending", "0x123"]) assert.match(txCell(bad), /not paid/);
});

test("rule rows for seller A's dispute", () => {
  const rows = ruleRows({
    status: "dispute",
    claims: { claimed_count: 1240, unique: true, fields: ["id", "ts"], no_nulls: true },
    count: 1240,
    unique_count: 860,
    failed: ["count", "unique", "no_nulls"],
  });
  assert.deepEqual(rows.map((r) => [r.rule, r.result]), [["count", "fail"], ["unique", "fail"], ["fields", "pass"], ["no_nulls", "fail"]]);
  assert.equal(rows[0].measured, "860 unique records");
});

test("rule rows: unjudged receipts never show a pass", () => {
  const rows = ruleRows({ status: "paid_unchecked", claims: null, failed: [] });
  assert.ok(rows.every((r) => r.result !== "pass"));
});

test("seller names come from sellers.json origins", () => {
  assert.equal(sellerName("https://a.test", { a: "https://a.test/v1/a.json" }), "Seller A");
  assert.equal(sellerName("https://z.test", {}), "z.test");
});

test("publish refuses malformed hashes and pending receipts", () => {
  const base = { receipts: [] };
  assert.doesNotThrow(() => validateForPublish({ ...base, receipts: [{ id: "1", tx_hash: H, status: "clean" }, { id: "2", tx_hash: null, status: "refused" }] }));
  assert.throws(() => validateForPublish({ receipts: [{ id: "f", tx_hash: "0xTEST_HASH_A", status: "dispute" }] }), /malformed tx_hash/);
  assert.throws(() => validateForPublish({ receipts: [{ id: "p", tx_hash: null, status: "pending" }] }), /pending/);
});

test("the committed published state contains no hash that kpass did not return", async () => {
  const { readFileSync } = await import("node:fs");
  const state = JSON.parse(readFileSync(new URL("../web/data/state.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => validateForPublish(state));
  assert.equal(state.mode, "published");
});

import { receiptCard, PREVIEW_RECEIPTS } from "../web/assets/render.js";

test("receipt card leads with promised → delivered (unique when claimed)", () => {
  const html = receiptCard(
    { id: "r1", origin: "https://a.test", status: "dispute", claims: { claimed_count: 1240, unique: true }, count: 1240, unique_count: 860, failed: ["count"], tx_hash: H },
    { sellers: { a: "https://a.test/v1/a.json" }, blocklist: { "https://a.test": { reason: "dispute" } } },
  );
  assert.match(html, /<span class="big">1240<\/span>/);
  assert.match(html, /tone-bad">860<\/span><span class="sub">unique of 1240/);
  assert.match(html, /href="\/app\/receipt\?id=r1"/);
  assert.match(html, /held · dispute/);
});

test("receipt card escapes seller- and model-controlled values", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const html = receiptCard({ id: `"><script>`, origin: "https://a.test", status: evil, claims: { claimed_count: 1 }, count: 1, unique_count: 1, failed: [evil], tx_hash: evil }, { sellers: {}, blocklist: {} });
  assert.ok(!html.includes("<img") && !html.includes("<script>"), html);
});

test("preview cards never show a hash and are not links", () => {
  const state = { sellers: { a: "https://seller-a/x", b: "https://seller-b/x" }, blocklist: {} };
  for (const r of PREVIEW_RECEIPTS) {
    const html = receiptCard({ ...r, origin: r.origin === "seller-a" ? "https://seller-a" : "https://seller-b" }, state, { preview: true });
    assert.ok(!/0x[0-9a-fA-F]{8}/.test(html), html);
    assert.ok(!html.includes("<a "), "preview must not link to a receipt");
  }
});

import { sellerSummary, sellerProfileCard } from "../web/assets/render.js";

test("seller summary counts outcomes and links the hold to its receipt", () => {
  const state = {
    sellers: { a: "https://a.test/v1/a.json", b: null },
    seller_labels: { a: "Delivered 1240 <b>records</b>" },
    blocklist: { "https://a.test": { reason: "dispute", receipt_id: "r1" } },
    receipts: [
      { id: "r1", origin: "https://a.test", status: "dispute", claims: { claimed_count: 1240, unique: true }, count: 1240, unique_count: 860, failed: ["count"] },
      { id: "r2", origin: "https://a.test", status: "refused", failed: [] },
      { id: "r9", origin: "https://other.test", status: "clean", failed: [] },
    ],
  };
  const s = sellerSummary(state, "a");
  assert.deepEqual([s.verified, s.disputes, s.stopped], [0, 1, 1]);
  assert.equal(s.holdReceipt.id, "r1");
  assert.equal(s.lastCheck.id, "r1");
  const html = sellerProfileCard(s);
  assert.match(html, /Held · dispute/);
  assert.match(html, /href="\/app\/receipt\?id=r1"/);
  assert.ok(!html.includes("<b>"), "seller promise must be escaped");
  const b = sellerProfileCard(sellerSummary(state, "b"));
  assert.match(b, /Not deployed yet/);
  assert.match(b, /No check published yet/);
});
