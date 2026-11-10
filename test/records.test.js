import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRecords, badgeEligible, badgeFileName, badgeSvg, RECORDS_VERSION } from "../src/records.js";
import { validateFeed, parseFeedList, createFeedChecker } from "../src/feeds.js";
import { createBuyer } from "../src/buy.js";
import { memoryStore } from "../src/store.js";
import { publish, writeBadges } from "../scripts/publish.mjs";
import { lookupRecord, checkResultHTML, normalizeSeller, recordListHTML } from "../web/assets/records-view.js";
import { fakeKpass, B_URL, B_ORIGIN, A_URL, A_ORIGIN } from "./helpers.js";

const NOT_A_TX = "0xTEST_HASH_RECORDS";
const SHAPED = "0x" + "0".repeat(63) + "2"; // valid shape for rendering tests only

const receipt = (o) => ({ id: o.id, origin: o.origin, url: `${o.origin}/v1/x.json`, status: o.status, tx_hash: o.tx ?? null, claims: o.claims ?? null, count: o.count ?? null, unique_count: o.unique ?? null, failed: o.failed ?? [], body_sha256: "b".repeat(64), prompt_sha256: "p".repeat(64), payment_rail: "x402-direct", created_at: "2026-11-10T10:00:00Z" });

function snapshot() {
  return {
    receipts: [
      receipt({ id: "a1", origin: A_ORIGIN, status: "dispute", tx: SHAPED, claims: { claimed_count: 1240, unique: true }, count: 1240, unique: 860, failed: ["count", "unique"] }),
      receipt({ id: "a2", origin: A_ORIGIN, status: "refused" }),
      receipt({ id: "b1", origin: B_ORIGIN, status: "clean", tx: SHAPED, claims: { claimed_count: 200 }, count: 200, unique: 200 }),
      receipt({ id: "c1", origin: "https://never-judged.test", status: "failed" }),
      receipt({ id: "d1", origin: "https://bad-hash.test", status: "clean", tx: NOT_A_TX, claims: { claimed_count: 1 }, count: 1, unique: 1 }),
    ],
    blocklist: { [A_ORIGIN]: { receipt_id: "a1", reason: "dispute", at: "2026-11-10T10:01:00Z" } },
  };
}

// ---------- records ----------
test("records: held seller carries the evidence of the receipt that caused the hold", () => {
  const feed = buildRecords(snapshot(), { now: () => "T" });
  assert.equal(feed.version, RECORDS_VERSION);
  const a = feed.records.find((r) => r.origin === A_ORIGIN);
  assert.equal(a.status, "held");
  assert.equal(a.reason, "dispute");
  assert.equal(a.evidence.receipt_id, "a1");
  assert.deepEqual(a.evidence.delivered, { count: 1240, unique_count: 860 });
  assert.deepEqual(a.counts, { verified: 0, disputes: 1, unverifiable: 0, stopped: 1 });
});

test("records: good standing, never-checked sellers get no record, and only real hashes are published", () => {
  const feed = buildRecords(snapshot());
  const b = feed.records.find((r) => r.origin === B_ORIGIN);
  assert.equal(b.status, "in_good_standing");
  assert.ok(!feed.records.some((r) => r.origin === "https://never-judged.test"));
  const d = feed.records.find((r) => r.origin === "https://bad-hash.test");
  assert.equal(d.evidence.tx_hash, null);
  assert.ok(!JSON.stringify(feed).includes(NOT_A_TX));
});

// ---------- badges ----------
test("badge: only a verified seller in good standing gets one", () => {
  const feed = buildRecords(snapshot());
  const byO = Object.fromEntries(feed.records.map((r) => [r.origin, r]));
  assert.equal(badgeEligible(byO[B_ORIGIN]), true);
  assert.equal(badgeEligible(byO[A_ORIGIN]), false);
  assert.throws(() => badgeSvg(byO[A_ORIGIN]), /no badge/);
  assert.equal(badgeEligible(undefined), false);
  assert.match(badgeSvg(byO[B_ORIGIN]), /verified · 1 check/);
});

test("badge: file names are safe host names", () => {
  assert.equal(badgeFileName("https://tare-seller-b.onrender.com"), "tare-seller-b.onrender.com.svg");
  assert.equal(badgeFileName("http://127.0.0.1:8091"), "127.0.0.1_8091.svg");
});

test("badge: publishing removes a badge when a seller is no longer eligible", () => {
  const dir = mkdtempSync(join(tmpdir(), "tare-badges-"));
  writeFileSync(join(dir, "seller-a.test.svg"), "<svg/>");
  const written = writeBadges(buildRecords(snapshot()).records, dir);
  assert.deepEqual(readdirSync(dir).sort(), written.sort());
  assert.ok(!readdirSync(dir).includes("seller-a.test.svg"));
});

test("publish writes state, records feed and badges, and never a malformed hash", () => {
  const store = memoryStore();
  for (const r of snapshot().receipts.filter((r) => r.id !== "d1")) store.put(r);
  store.block(A_ORIGIN, { receipt_id: "a1", reason: "dispute", at: "T" });
  const webDir = mkdtempSync(join(tmpdir(), "tare-web-"));
  const { feed, badges } = publish({ store, sellers: { a: A_URL, b: B_URL }, webDir });
  assert.equal(JSON.parse(readFileSync(join(webDir, "records.json"), "utf8")).records.length, feed.records.length);
  assert.deepEqual(badges, ["seller-b.test.svg"]);
  assert.ok(JSON.parse(readFileSync(join(webDir, "data", "state.json"), "utf8")).receipts.length >= 3);
});

// ---------- feeds ----------
const feedJson = (records) => ({ version: RECORDS_VERSION, publisher: "x", records });

test("feeds: malformed records are ignored one by one", () => {
  const { records, ignored } = validateFeed(feedJson([
    { origin: B_ORIGIN, status: "held", reason: "dispute" },
    { origin: "not a url", status: "held", reason: "x" },
    { origin: "https://x.test/path", status: "held", reason: "x" }, // not a bare origin
    { origin: "https://y.test", status: "banned", reason: "x" },
    { origin: "https://z.test", status: "held" }, // no reason
  ]));
  assert.equal(records.size, 1);
  assert.equal(ignored, 4);
  assert.throws(() => validateFeed({ version: 99, records: [] }), /not a Tare records feed/);
});

test("feeds: only https feed URLs are trusted", () => {
  assert.deepEqual(parseFeedList(" https://a.test/records.json, http://evil.test/r.json , file:///etc/passwd,,"), ["https://a.test/records.json"]);
});

const fakeFeedFetch = (map) => async (url) => {
  const v = map[url];
  if (v instanceof Error) throw v;
  if (v === undefined) return new Response("nope", { status: 404 });
  return new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
};

test("feeds: a trusted feed hit stops the buy before any payment", async () => {
  const kpass = fakeKpass();
  const feedCheck = createFeedChecker({ feeds: ["https://feed.test/records.json"], fetchImpl: fakeFeedFetch({ "https://feed.test/records.json": feedJson([{ origin: B_ORIGIN, status: "held", reason: "dispute", since: "T" }]) }) });
  const buyer = createBuyer({ store: memoryStore(), kpass, extract: async () => ({ claims: { claimed_count: 200, unique: null, fields: null, no_nulls: null } }), promptSha256: "x", feedCheck });
  const r = await buyer.buy(B_URL);
  assert.equal(r.status, "refused");
  assert.match(r.reason, /held in trusted feed https:\/\/feed\.test\/records\.json \(dispute\)/);
  assert.equal(kpass.calls.length, 0);
});

test("feeds: the operator can explicitly allow a feed-held seller, and the receipt says so", async () => {
  const kpass = fakeKpass();
  const feedCheck = createFeedChecker({ feeds: ["https://feed.test/r.json"], fetchImpl: fakeFeedFetch({ "https://feed.test/r.json": feedJson([{ origin: B_ORIGIN, status: "held", reason: "dispute" }]) }) });
  const buyer = createBuyer({ store: memoryStore(), kpass, extract: async () => ({ claims: { claimed_count: 200, unique: null, fields: null, no_nulls: null } }), promptSha256: "x", feedCheck });
  const r = await buyer.buy(B_URL, { allowFeedHold: true });
  assert.equal(r.status, "clean");
  assert.equal(kpass.calls.length, 1);
  assert.ok(r.feed_notes.some((n) => /allowed by the operator/.test(n)));
});

test("feeds: an unreachable or bad feed never blocks a buy and is noted on the receipt", async () => {
  const kpass = fakeKpass();
  const feedCheck = createFeedChecker({
    feeds: ["https://down.test/r.json", "https://bad.test/r.json", "https://missing.test/r.json"],
    fetchImpl: fakeFeedFetch({ "https://down.test/r.json": new Error("ECONNREFUSED"), "https://bad.test/r.json": { hello: "world" } }),
  });
  const buyer = createBuyer({ store: memoryStore(), kpass, extract: async () => ({ claims: { claimed_count: 200, unique: null, fields: null, no_nulls: null } }), promptSha256: "x", feedCheck });
  const r = await buyer.buy(B_URL);
  assert.equal(r.status, "clean");
  assert.equal(kpass.calls.length, 1);
  assert.equal(r.feed_notes.length, 3);
  assert.ok(r.feed_notes.some((n) => /unreachable: ECONNREFUSED/.test(n)));
  assert.ok(r.feed_notes.some((n) => /ignored: not a Tare records feed/.test(n)));
  assert.ok(r.feed_notes.some((n) => /HTTP 404/.test(n)));
});

test("feeds: a seller in good standing in a feed is not stopped", async () => {
  const kpass = fakeKpass();
  const feedCheck = createFeedChecker({ feeds: ["https://feed.test/r.json"], fetchImpl: fakeFeedFetch({ "https://feed.test/r.json": feedJson([{ origin: B_ORIGIN, status: "in_good_standing", reason: null }]) }) });
  const buyer = createBuyer({ store: memoryStore(), kpass, extract: async () => ({ claims: { claimed_count: 200, unique: null, fields: null, no_nulls: null } }), promptSha256: "x", feedCheck });
  assert.equal((await buyer.buy(B_URL)).status, "clean");
});

// ---------- check page ----------
test("check page: normalises URLs and bare hosts to an origin", () => {
  assert.equal(normalizeSeller("tare-seller-b.onrender.com").origin, "https://tare-seller-b.onrender.com");
  assert.equal(normalizeSeller("https://x.test/v1/a.json?q=1").origin, "https://x.test");
  assert.ok(normalizeSeller("").error);
  assert.ok(normalizeSeller("ftp://x.test").error);
});

test("check page: held, good standing and never-checked results; badge only when verified", () => {
  const feed = buildRecords(snapshot());
  const held = checkResultHTML(lookupRecord(feed, A_URL), { siteOrigin: "https://site.test" });
  assert.match(held, /held · dispute/);
  assert.doesNotMatch(held, /badges\//);
  const good = checkResultHTML(lookupRecord(feed, B_URL), { siteOrigin: "https://site.test" });
  assert.match(good, /in good standing/);
  assert.match(good, /https:\/\/site\.test\/badges\/seller-b\.test\.svg/);
  const never = checkResultHTML(lookupRecord(feed, "https://unknown.test"), { siteOrigin: "https://site.test" });
  assert.match(never, /never checked/);
  assert.doesNotMatch(never, /badges\//);
});

test("check page: everything from a feed is escaped", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const feed = { records: [{ origin: "https://evil.test", status: "held", reason: evil, since: evil, counts: { verified: evil }, evidence: { status: evil, failed: [evil], tx_hash: evil, body_sha256: evil, promised: { claimed_count: evil }, delivered: { count: evil, unique_count: evil } } }] };
  const html = checkResultHTML(lookupRecord(feed, "https://evil.test"), { siteOrigin: "https://site.test" }) + recordListHTML(feed);
  assert.ok(!html.includes("<img src=x"), html);
});
