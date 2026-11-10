import { test } from "node:test";
import assert from "node:assert/strict";
import { createFeedChecker } from "../src/feeds.js";
import { TEST_TX } from "./helpers.js";

const FEED = "https://records.test/v1/records.json";
const feedJson = { version: 1, records: [{ origin: "https://bad.test", status: "held", reason: "dispute", since: "2026-11-10T00:00:00Z" }] };
const r402 = () => new Response("{}", { status: 402 });

test("paid feed: without TARE_PAY_FEEDS the 402 is noted and nothing is paid", async () => {
  const check = createFeedChecker({ feeds: [FEED], fetchImpl: async () => r402() });
  const r = await check("https://bad.test");
  assert.equal(r.hold, null);
  assert.match(r.notes.join(" "), /charges per lookup; set TARE_PAY_FEEDS=1/);
});

test("paid feed: with payFetch the lookup is paid once, noted with its hash, and cached", async () => {
  let paid = 0;
  let t = 0;
  const check = createFeedChecker({
    feeds: [FEED],
    fetchImpl: async () => r402(),
    payFetch: async () => (paid++, { status: 200, bodyText: JSON.stringify(feedJson), paymentHash: TEST_TX }),
    cacheMs: 1000,
    now: () => t,
  });
  const first = await check("https://bad.test");
  assert.equal(first.hold.reason, "dispute");
  assert.ok(first.notes.some((n) => n.includes("paid lookup") && n.includes(TEST_TX)));
  const second = await check("https://bad.test");
  assert.equal(second.hold.reason, "dispute");
  assert.equal(paid, 1, "cached: no second payment");
  t = 2000;
  await check("https://bad.test");
  assert.equal(paid, 2, "cache expired: paid again");
});

test("paid feed: a failed paid lookup never blocks and is noted", async () => {
  const check = createFeedChecker({ feeds: [FEED], fetchImpl: async () => r402(), payFetch: async () => ({ status: 500, bodyText: "", paymentHash: null }) });
  const r = await check("https://bad.test");
  assert.equal(r.hold, null);
  assert.match(r.notes.join(" "), /paid lookup returned HTTP 500/);
});
