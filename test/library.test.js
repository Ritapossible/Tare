import { test } from "node:test";
import assert from "node:assert/strict";
import { verify, PROMPT_SHA256 } from "tare";

const reply = (claims) => async (_m, kind) =>
  kind === "freshness" ? '{"max_age_hours":null}' : JSON.stringify({ claimed_count: null, unique: null, fields: null, no_nulls: null, ...claims });
const rows = (n, dup = 0) => Array.from({ length: n }, (_, i) => ({ id: i < dup ? 0 : i, ts: "2026-11-10T00:00:00Z" }));

test("library: verify() passes a kept promise", async () => {
  const r = await verify("Delivered 3 unique records, fields id and ts.", rows(3), { complete: reply({ claimed_count: 3, unique: true, fields: ["id", "ts"] }) });
  assert.equal(r.verdict, "clean");
  assert.deepEqual(r.failed, []);
  assert.equal(r.prompt_sha256, PROMPT_SHA256);
});

test("library: verify() disputes a broken promise", async () => {
  const r = await verify("Delivered 3 unique records.", rows(3, 2), { complete: reply({ claimed_count: 3, unique: true }) });
  assert.equal(r.verdict, "dispute");
  assert.ok(r.failed.includes("unique"));
});

test("library: an invented claim is dropped, so a promise of nothing is unverifiable", async () => {
  const r = await verify("Fresh data for your agent.", rows(3), { complete: reply({ claimed_count: 3 }) });
  assert.equal(r.verdict, "unverifiable");
  assert.equal(r.claims.claimed_count, null);
  assert.ok(r.notes.some((n) => /claimed_count/.test(n)));
});

test("library: rows that are not objects are a shape dispute without calling SERV", async () => {
  let called = false;
  const r = await verify("Delivered 2 records.", [1, 2], { complete: async () => ((called = true), "{}") });
  assert.equal(r.verdict, "dispute");
  assert.deepEqual(r.failed, ["shape"]);
  assert.equal(called, false);
});
