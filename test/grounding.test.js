import { test } from "node:test";
import assert from "node:assert/strict";
import { ground, statedNumbers, statedWindows, extractClaims } from "../src/serv.js";

const C = (o) => ({ claimed_count: null, unique: null, fields: null, no_nulls: null, max_age_hours: null, ...o });
const exact = (t) => statedNumbers(t).filter((n) => !n.bounded).map((n) => n.value);

test("numbers: digits, separators, words and Spanish", () => {
  assert.deepEqual(exact("Delivered 1,240 records."), [1240]);
  assert.deepEqual(exact("Delivered 1240 records."), [1240]);
  assert.deepEqual(exact("Delivered twelve hundred and forty records."), [1240]);
  assert.deepEqual(exact("one thousand two hundred forty unique records"), [1240]);
  assert.deepEqual(exact("two hundred records"), [200]);
  assert.deepEqual(exact("forty-one rows"), [41]);
  assert.deepEqual(exact("Se entregaron doscientos registros."), [200]);
});

test("numbers: prices, decimals, percentages, times and a lone 'one' are not counts", () => {
  assert.deepEqual(exact("Priced at $0.002 per URL plus a $0.001 fee."), []);
  assert.deepEqual(exact("class=true (~7%+) is rare"), []);
  assert.deepEqual(exact("expires at 23:59 UTC, 1.5x faster"), []);
  assert.deepEqual(exact("Complete weather bundle in one call."), []);
  assert.deepEqual(exact("one thousand records"), [1000]);
  assert.deepEqual(exact("about 200 rows, candles lag ~2 days, HIP-4 markets"), []);
  assert.deepEqual([...statedWindows("candles lag ~2 days")], []);
});

test("numbers: upper bounds and floors are not exact counts", () => {
  assert.deepEqual(exact("Returns up to 20 posts per call."), []);
  assert.deepEqual(exact("Search 10,000+ brands across 180+ countries."), []);
  assert.deepEqual(exact("at most twenty rows"), []);
});

test("windows: explicit windows only, in hours", () => {
  assert.deepEqual([...statedWindows("records from the last 24 hours")], [24]);
  assert.deepEqual([...statedWindows("This week's export")], [168]);
  assert.deepEqual([...statedWindows("within the last two days")], [48]);
  assert.deepEqual([...statedWindows("the past hour")], [1]);
  assert.deepEqual([...statedWindows("Latest filings, real-time, always fresh")], []);
});

test("grounding keeps claims the seller's text states", () => {
  const prose = "Delivered one thousand two hundred forty unique records, fields id and ts, no nulls.";
  const want = C({ claimed_count: 1240, unique: true, fields: ["id", "ts"], no_nulls: true });
  assert.deepEqual(ground(want, prose), { claims: want, dropped: [] });
  const fresh = C({ claimed_count: 500, max_age_hours: 24 });
  assert.deepEqual(ground(fresh, "Delivered 500 records from the last 24 hours.").dropped, []);
});

// Paraphrases of real public x402 seller descriptions on which SERV invented claims (10 Nov probe).
test("grounding drops claims SERV invented from real service descriptions", () => {
  const invented = C({ claimed_count: 5, unique: true, no_nulls: true });
  assert.deepEqual(ground(invented, "Search 10,000+ gift card brands across 180+ countries by name.").dropped, ["claimed_count", "unique", "no_nulls"]);
  assert.deepEqual(
    ground(C({ claimed_count: 5, max_age_hours: 1 }), "Latest company filings by ticker: annual, quarterly and event reports.").dropped,
    ["claimed_count", "max_age_hours"],
  );
  // "API key" is not a field list, and sentences are not field names.
  assert.deepEqual(
    ground(C({ fields: ["chat completions", "no account and no API key"] }), "Chat completions with no account and no API key.").dropped,
    ["fields"],
  );
  // "up to 10 results" must not become an exact count of 10.
  assert.deepEqual(ground(C({ claimed_count: 10 }), "Send a query, get up to 10 ranked results.").dropped, ["claimed_count"]);
});

test("grounding: a field must appear in the text, not just the word 'fields'", () => {
  assert.deepEqual(ground(C({ fields: ["id", "score"] }), "Delivered 200 records, fields id and ts.").dropped, ["fields"]);
  assert.deepEqual(ground(C({ fields: ["records"] }), "Delivered 1,240 records.").dropped, ["fields"]);
});

test("grounding never adds or changes a claim", () => {
  const prose = "Delivered 1,240 unique records, fields id and ts, no nulls, from the last 24 hours.";
  const { claims } = ground(C({}), prose);
  assert.deepEqual(claims, C({}));
  const { claims: c2 } = ground(C({ claimed_count: 1240 }), prose);
  assert.deepEqual(c2, C({ claimed_count: 1240 }));
});

test("extractClaims notes the claims it dropped; a dropped count fails closed downstream", async () => {
  const complete = async (_m, kind) => (kind === "freshness" ? '{"max_age_hours":null}' : JSON.stringify(C({ claimed_count: 5, unique: true })));
  const r = await extractClaims("Search 10,000+ brands.", { complete });
  assert.equal(r.claims.claimed_count, null);
  assert.ok(r.notes.some((n) => /claims dropped.*claimed_count.*unique/.test(n)), r.notes.join("|"));
});
