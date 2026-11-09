import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, txCell, ruleRows, receiptRow, sellerName } from "../web/assets/render.js";
import { validateForPublish } from "../scripts/publish.mjs";

const H = "0x" + "ab".repeat(32); // syntactically valid, not a real transaction

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
  assert.match(txCell(H), /0xabababab…ababab/);
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
