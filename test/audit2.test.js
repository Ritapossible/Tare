// Regression tests for audit findings 9-10 and 15-26 (10 Nov).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createKpass, parseKpassOutput } from "../src/kpass.js";
import { createBuyer } from "../src/buy.js";
import { memoryStore, fileStore } from "../src/store.js";
import { assertDistinctOrigins } from "../src/config.js";
import { createApp } from "../src/server.js";
import { TX_HASH } from "../src/txhash.js";
import { sellerSummary, receiptRow, receiptNotesHTML } from "../web/assets/render.js";
import { setup, A_URL, B_URL, TEST_TX, BODY_B } from "./helpers.js";

const sha = (b) => createHash("sha256").update(b).digest("hex");

// 9. Multi-byte characters split across stdout chunks survive.
test("audit 9: kpass output split inside a UTF-8 character is decoded intact", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tare-kpass-"));
  const bin = join(dir, "fake-kpass");
  const json = Buffer.from(JSON.stringify({ status: 200, body: "café", headers: { "payment-response": TEST_TX } }), "utf8");
  const cut = json.indexOf(Buffer.from("é")) + 1; // between the two bytes of "é"
  writeFileSync(
    bin,
    `#!${process.execPath}\nconst b = Buffer.from(${JSON.stringify(json.toString("base64"))}, "base64");\nprocess.stdout.write(b.subarray(0, ${cut}));\nsetTimeout(() => process.stdout.write(b.subarray(${cut})), 50);\n`,
  );
  chmodSync(bin, 0o755);
  const r = await createKpass({ bin, timeoutMs: 10_000 }).execute("https://s.test/x", { idempotencyKey: "k" });
  assert.equal(r.bodyText, "café");
  assert.equal(r.paymentHash, TEST_TX);
});

// 10. The evidence hash is of the seller's bytes; a re-serialised body says so.
test("audit 10: body hash uses the raw bytes when the rail has them", async () => {
  // A trailing invalid UTF-8 byte: decoding to text would change it, so only a raw-byte hash matches.
  const bytes = Buffer.concat([Buffer.from(BODY_B, "utf8"), Buffer.from([0xff])]);
  const b = createBuyer({
    store: memoryStore(),
    kpass: { execute: async () => ({ status: 200, bodyText: bytes.toString("utf8"), bodyBytes: bytes, paymentHash: TEST_TX, raw: "" }) },
    extract: async () => ({ claims: { claimed_count: 200, unique: null, fields: null, no_nulls: null, max_age_hours: null } }),
    promptSha256: "x",
  });
  const r = await b.buy(B_URL);
  assert.equal(r.body_sha256, sha(bytes));
  assert.equal(r.body_notes, undefined);
});

test("audit 10: kpass body_base64 is used as raw bytes; an already-parsed body is flagged", () => {
  const raw = Buffer.from('{"prose":"x","rows":[]}  ');
  const a = parseKpassOutput(JSON.stringify({ status: 200, body_base64: raw.toString("base64") }));
  assert.deepEqual(a.bodyBytes, raw);
  const b = parseKpassOutput(JSON.stringify({ status: 200, body: { prose: "x", rows: [] } }));
  assert.match(b.bodyNote, /re-serialisation/);
});

// 16. Buying A must not need B's URL.
test("audit 16: a seller without a URL does not stop the others (unless all are required)", () => {
  assert.doesNotThrow(() => assertDistinctOrigins({ a: A_URL, b: "" }, { requireAll: false }));
  assert.throws(() => assertDistinctOrigins({ a: A_URL, b: "" }), /no URL/);
  assert.throws(() => assertDistinctOrigins({ a: A_URL, b: A_URL }, { requireAll: false }), /share origin/);
});

// 18. A JSON null body is a 400, and the content-type check ignores case.
test("audit 18: /api/buy rejects non-object JSON with 400; Content-Type is case-insensitive", async () => {
  const t = setup();
  const server = createApp({ tare: { store: t.store, buy: t.buy }, sellers: { a: A_URL, b: B_URL }, webRoot: "web" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/api/buy`;
  try {
    for (const body of ["null", "[]", "3"]) {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-tare-request": "1" }, body });
      assert.equal(r.status, 400, body);
    }
    const ok = await fetch(url, { method: "POST", headers: { "content-type": "Application/JSON; charset=utf-8", "x-tare-request": "1" }, body: '{"seller":"b"}' });
    assert.equal(ok.status, 200);
    assert.equal(t.kpass.calls.length, 1);
  } finally {
    server.close();
  }
});

// 19. The Sellers page counts disputes the way the console does.
test("audit 19: an unverifiable hold is not counted as a dispute on the Sellers page", () => {
  const origin = new URL(A_URL).origin;
  const state = { sellers: { a: A_URL }, receipts: [{ id: "1", origin, status: "unverifiable" }, { id: "2", origin, status: "dispute" }], blocklist: {} };
  assert.equal(sellerSummary(state, "a").disputes, 1);
});

// 20. A claimed count is escaped wherever it is shown.
test("audit 20: claimed counts go through esc()", () => {
  const html = receiptRow({ id: "r", origin: "https://s.test", status: "clean", claims: { claimed_count: "<b>9</b>" }, failed: [] }, {});
  assert.ok(!html.includes("<b>9</b>"));
});

// 23. One hash pattern: the static site's copy matches src/txhash.js.
test("audit 23: web/assets/render.js uses the same hash pattern as src/txhash.js", () => {
  const web = readFileSync(new URL("../web/assets/render.js", import.meta.url), "utf8");
  assert.ok(web.includes(`const TX = ${TX_HASH.toString()};`));
});

// 26. The cached store still sees a change made by another process.
test("audit 26: the file store notices an outside write", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "tare-store-")), "store.json");
  const s = fileStore(path);
  s.block("https://x.test", { reason: "dispute" });
  assert.ok(s.blockEntry("https://x.test"));
  await new Promise((r) => setTimeout(r, 20)); // a different mtime
  const outside = JSON.parse(readFileSync(path, "utf8"));
  outside.blocklist = {};
  writeFileSync(path, JSON.stringify(outside, null, 2) + "\n ");
  assert.equal(s.blockEntry("https://x.test"), null);
  // and a caller mutating what it read cannot corrupt the cache
  s.snapshot().blocklist["https://y.test"] = {};
  assert.equal(s.blockEntry("https://y.test"), null);
});

test("receipt notes: every note is shown, escaped", () => {
  const html = receiptNotesHTML({ serv_notes: ["claims dropped, not in the seller's text: unique"], ad_notes: ["<img src=x>"], feed_notes: [], body_notes: ["re-serialised"] });
  assert.match(html, /claims dropped/);
  assert.match(html, /re-serialised/);
  assert.ok(html.includes("&lt;img src=x&gt;") && !html.includes("<img"));
  assert.equal(receiptNotesHTML({}), "");
});
