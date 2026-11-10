import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClaims } from "../src/serv.js";
import { check, oldestAgeHours } from "../src/check.js";
import { readAdvertisement } from "../src/tare.js";
import { createBuyer } from "../src/buy.js";
import { memoryStore } from "../src/store.js";
import { ruleRows, advertisedRows, promiseHTML } from "../web/assets/render.js";
import { buildRecords } from "../src/records.js";
import { checkResultHTML, lookupRecord } from "../web/assets/records-view.js";
import { fakeKpass, fakeServ, HONEST, B_URL, A_URL, B_ORIGIN } from "./helpers.js";
import { extractClaims } from "../src/serv.js";

const C = (o) => ({ claimed_count: null, unique: null, fields: null, no_nulls: null, max_age_hours: null, ...o });
const NOW = Date.parse("2026-11-10T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();

// ---------- freshness ----------
test("freshness: parse accepts whole hours >= 1 only", () => {
  assert.equal(parseClaims('{"claimed_count":1,"max_age_hours":24}').max_age_hours, 24);
  for (const bad of ['{"max_age_hours":0}', '{"max_age_hours":"24"}', '{"max_age_hours":1.5}', '{"max_age_hours":-3}']) {
    assert.equal(parseClaims(bad), null, bad);
  }
});

test("freshness: rows inside the claimed window pass; one stale row fails", () => {
  const fresh = [{ id: 1, ts: hoursAgo(1) }, { id: 2, ts: hoursAgo(23) }];
  assert.deepEqual(check(fresh, C({ claimed_count: 2, max_age_hours: 24 }), { now: NOW }).failed, []);
  const stale = [...fresh, { id: 3, ts: hoursAgo(30) }];
  const r = check(stale, C({ claimed_count: 3, max_age_hours: 24 }), { now: NOW });
  assert.deepEqual(r.failed, ["fresh"]);
  assert.equal(r.oldest_age_hours, 30);
});

test("freshness: a row without a usable timestamp cannot prove freshness", () => {
  assert.deepEqual(check([{ id: 1, ts: null }], C({ claimed_count: 1, max_age_hours: 24 }), { now: NOW }).failed, ["fresh"]);
  assert.deepEqual(check([{ id: 1 }], C({ claimed_count: 1, max_age_hours: 24 }), { now: NOW }).failed, ["fresh"]);
  assert.equal(oldestAgeHours([{ id: 1 }], NOW), null);
});

test("freshness: timestamps far in the future fail; small clock skew is tolerated", () => {
  assert.deepEqual(check([{ id: 1, ts: hoursAgo(-2) }], C({ claimed_count: 1, max_age_hours: 24 }), { now: NOW }).failed, ["fresh"]);
  assert.deepEqual(check([{ id: 1, ts: new Date(NOW + 60_000).toISOString() }], C({ claimed_count: 1, max_age_hours: 24 }), { now: NOW }).failed, []);
});

test("freshness: not claimed means not checked", () => {
  assert.deepEqual(check([{ id: 1, ts: "1999-01-01T00:00:00Z" }], C({ claimed_count: 1 }), { now: NOW }).failed, []);
});

// ---------- verbatim promise + advertisement ----------
function buyer({ ad, serv = fakeServ(HONEST), kpass = fakeKpass() } = {}) {
  return {
    kpass,
    serv,
    b: createBuyer({
      store: memoryStore(),
      kpass,
      extract: (p) => extractClaims(p, { complete: serv.complete }),
      promptSha256: "x",
      readAdvertisement: ad === undefined ? null : async () => ad,
    }),
  };
}

test("receipts keep the seller's promise word for word", async () => {
  const { b } = buyer();
  const r = await b.buy(B_URL);
  assert.equal(r.promise, "Delivered two hundred records, fields id and ts, no nulls.");
});

test("a false 402 advertisement disputes a delivery whose prose was honest", async () => {
  // Seller B's rows (200) match its prose, but its 402 advertised 1,240 unique records.
  const { b } = buyer({ ad: { description: "Delivered one thousand two hundred forty unique records, fields id and ts, no nulls." } });
  const r = await b.buy(B_URL);
  assert.equal(r.status, "dispute");
  assert.ok(r.failed.includes("advertised:count"), r.failed.join(","));
  assert.ok(!r.failed.includes("count"), "the prose itself was honest");
  assert.equal(r.advertised, "Delivered one thousand two hundred forty unique records, fields id and ts, no nulls.");
  assert.equal(r.advertised_claims.claimed_count, 1240);
});

test("an honest advertisement keeps an honest delivery clean", async () => {
  const { b } = buyer({ ad: { description: "Delivered two hundred records, fields id and ts, no nulls." } });
  assert.equal((await b.buy(B_URL)).status, "clean");
});

test("a missing or unreadable advertisement never changes the verdict, and is noted", async () => {
  const { b } = buyer({ ad: { description: null, note: "the 402 carries no description" } });
  const r = await b.buy(B_URL);
  assert.equal(r.status, "clean");
  assert.deepEqual(r.ad_notes, ["the 402 carries no description"]);
});

test("the advertisement is read before payment", async () => {
  let paidFirst = false;
  const kpass = fakeKpass();
  const { b } = buyer({ kpass, ad: undefined });
  const order = [];
  const b2 = createBuyer({
    store: memoryStore(),
    kpass: { execute: async (u, o) => (order.push("pay"), kpass.execute(u, o)) },
    extract: async () => ({ claims: C({ claimed_count: 200 }) }),
    promptSha256: "x",
    readAdvertisement: async () => (order.push("ad"), { description: null }),
  });
  await b2.buy(B_URL);
  assert.deepEqual(order, ["ad", "pay"]);
  assert.equal(paidFirst, false);
});

// ---------- reading the 402 ----------
const resp = (status, headers = {}) => new Response("{}", { status, headers });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");

test("readAdvertisement returns the 402 resource description", async () => {
  const fetchImpl = async () => resp(402, { "PAYMENT-REQUIRED": b64({ x402Version: 2, resource: { url: "u", description: "  200 records, no nulls.  " }, accepts: [] }) });
  assert.deepEqual(await readAdvertisement("https://s.test/x", { fetchImpl }), { description: "200 records, no nulls.", note: null });
});

test("readAdvertisement notes every way a 402 can lack a description", async () => {
  assert.match((await readAdvertisement("u", { fetchImpl: async () => resp(200) })).note, /HTTP 200/);
  assert.match((await readAdvertisement("u", { fetchImpl: async () => resp(402) })).note, /without a PAYMENT-REQUIRED/);
  assert.match((await readAdvertisement("u", { fetchImpl: async () => resp(402, { "PAYMENT-REQUIRED": "%%%" }) })).note, /not base64 JSON/);
  assert.match((await readAdvertisement("u", { fetchImpl: async () => resp(402, { "PAYMENT-REQUIRED": b64({ resource: {} }) }) })).note, /no description/);
});

// ---------- display ----------
test("receipt page: fresh row, advertised rows and the verbatim promise (escaped)", () => {
  const r = {
    status: "dispute",
    claims: C({ claimed_count: 3, max_age_hours: 24 }),
    advertised_claims: C({ claimed_count: 1240, unique: true }),
    count: 3, unique_count: 3, oldest_age_hours: 30,
    failed: ["fresh", "advertised:count", "advertised:unique"],
    promise: "Delivered <b>3</b> records from the last 24 hours.",
    advertised: "1,240 unique records",
  };
  const fresh = ruleRows(r).find((x) => x.rule === "fresh");
  assert.deepEqual([fresh.claimed, fresh.measured, fresh.result], ["within 24 h", "oldest record 30 h old", "fail"]);
  assert.deepEqual(advertisedRows(r).map((x) => [x.rule, x.result]), [["advertised:count", "fail"], ["advertised:unique", "fail"]]);
  const html = promiseHTML(r);
  assert.match(html, /In the delivery/);
  assert.match(html, /In the 402 advertisement/);
  assert.ok(html.includes("&lt;b&gt;3&lt;/b&gt;") && !html.includes("<b>3</b>"));
});

test("check page shows the seller's promise word for word, escaped", () => {
  const feed = buildRecords({ receipts: [{ id: "1", origin: B_ORIGIN, url: B_URL, status: "clean", claims: C({ claimed_count: 200 }), count: 200, unique_count: 200, failed: [], promise: "<i>200</i> records" }], blocklist: {} });
  const html = checkResultHTML(lookupRecord(feed, B_URL), { siteOrigin: "https://site.test" });
  assert.ok(html.includes("&lt;i&gt;200&lt;/i&gt; records") && !html.includes("<i>200</i>"));
});
