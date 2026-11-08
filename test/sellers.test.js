import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAll, SELLER_A_PROSE, SELLER_B_PROSE } from "../sellers/generate.mjs";

// Independent counting (not src/check.js) so the fixtures and the checker can't share a bug.
function load(name) {
  return JSON.parse(readFileSync(new URL(`../sellers/data/${name}`, import.meta.url), "utf8"));
}
function distinct(rows) {
  return new Set(rows.map((r) => r.id)).size;
}

test("committed seller payloads match the generator byte for byte", () => {
  const files = buildAll();
  for (const [name, text] of Object.entries(files)) {
    const committed = readFileSync(new URL(`../sellers/data/${name}`, import.meta.url), "utf8");
    assert.equal(committed, text, `${name} drifted; run node sellers/generate.mjs`);
  }
});

test("seller A: 1240 rows, 860 unique ids, 40 null ts, dirty prose", () => {
  const a = load("a.json");
  assert.equal(a.prose, SELLER_A_PROSE);
  assert.equal(a.rows.length, 1240);
  assert.equal(distinct(a.rows), 860);
  assert.equal(a.rows.filter((r) => r.ts === null).length, 40);
  assert.ok(a.rows.every((r) => Object.keys(r).join() === "id,ts"));
});

test("seller A duplicates are interleaved, not appended at the end", () => {
  const a = load("a.json");
  const seen = new Set();
  let firstDup = -1;
  a.rows.forEach((r, i) => {
    if (seen.has(r.id) && firstDup < 0) firstDup = i;
    seen.add(r.id);
  });
  assert.ok(firstDup > 0 && firstDup < 860, `first duplicate at ${firstDup}`);
});

test("seller B: 200 rows, 200 unique ids, no nulls or empty strings", () => {
  const b = load("b.json");
  assert.equal(b.prose, SELLER_B_PROSE);
  assert.equal(b.rows.length, 200);
  assert.equal(distinct(b.rows), 200);
  assert.ok(b.rows.every((r) => typeof r.id === "string" && r.id && typeof r.ts === "string" && r.ts));
});

test("payloads hold prose and rows only", () => {
  for (const name of ["a.json", "b.json"]) {
    assert.deepEqual(Object.keys(load(name)), ["prose", "rows"]);
  }
});
