import { test } from "node:test";
import assert from "node:assert/strict";
import { check, parseBody, measure } from "../src/check.js";
import { BODY_A, BODY_B } from "./helpers.js";

const claims = (c) => ({ claimed_count: null, unique: null, fields: null, no_nulls: null, ...c });
const rows = (...r) => r;

test("seller A against its own label: count, unique, no_nulls fail", () => {
  const { rows: a } = parseBody(BODY_A);
  const r = check(a, claims({ claimed_count: 1240, unique: true, fields: ["id", "ts"], no_nulls: true }));
  const { oldest_age_hours, details, ...rest } = r;
  assert.deepEqual(rest, { count: 1240, unique_count: 860, failed: ["count", "unique", "no_nulls"], verdict: "dispute" });
  assert.deepEqual(details, { rows: 1240, unique_ids: 860, duplicate_ids: 380, rows_missing_field: {}, empty_values: { ts: 40 } });
});

test("seller B against its own label: clean", () => {
  const { rows: b } = parseBody(BODY_B);
  const r = check(b, claims({ claimed_count: 200, fields: ["id", "ts"], no_nulls: true }));
  const { oldest_age_hours, details, ...rest } = r;
  assert.deepEqual(rest, { count: 200, unique_count: 200, failed: [], verdict: "clean" });
  assert.deepEqual(details, { rows: 200, unique_ids: 200, duplicate_ids: 0, rows_missing_field: {}, empty_values: {} });
});

test("count compares to unique_count only when unique is claimed", () => {
  const dup = rows({ id: 1 }, { id: 1 }, { id: 2 });
  assert.deepEqual(check(dup, claims({ claimed_count: 3 })).failed, []);
  assert.deepEqual(check(dup, claims({ claimed_count: 2, unique: true })).failed, ["unique"]);
  assert.deepEqual(check(dup, claims({ claimed_count: 3, unique: true })).failed, ["count", "unique"]);
});

test("fields: every row must own every named field", () => {
  const r = rows({ id: 1, ts: "x" }, { id: 2 });
  assert.deepEqual(check(r, claims({ claimed_count: 2, fields: ["id", "ts"] })).failed, ["fields"]);
  assert.deepEqual(check(r, claims({ claimed_count: 2, fields: ["id"] })).failed, []);
});

test("fields: inherited properties do not count", () => {
  const proto = { ts: "x" };
  const r = [Object.assign(Object.create(proto), { id: 1 })];
  assert.deepEqual(check(r, claims({ claimed_count: 1, fields: ["ts"] })).failed, ["fields"]);
});

test("no_nulls: null and empty string fail; checks named fields only when given", () => {
  const r = rows({ id: 1, ts: "x", note: null }, { id: 2, ts: "" });
  assert.deepEqual(check(r, claims({ claimed_count: 2, fields: ["id"], no_nulls: true })).failed, []);
  assert.deepEqual(check(r, claims({ claimed_count: 2, fields: ["ts"], no_nulls: true })).failed, ["no_nulls"]);
});

test("no_nulls without fields checks every key of every row", () => {
  const r = rows({ id: 1, ts: "x" }, { id: 2, ts: "y", note: null });
  assert.deepEqual(check(r, claims({ claimed_count: 2, no_nulls: true })).failed, ["no_nulls"]);
});

test("fail closed: no count claim and nothing failed → unverifiable", () => {
  assert.equal(check(rows({ id: 1 }), claims({})).verdict, "unverifiable");
  assert.equal(check(rows({ id: 1 }), claims({ fields: ["id"], no_nulls: true })).verdict, "unverifiable");
});

test("no count claim but another claim fails → dispute", () => {
  assert.equal(check(rows({ id: 1, ts: null }), claims({ no_nulls: true })).verdict, "dispute");
});

test("empty delivery with an honest zero claim is clean", () => {
  assert.equal(check([], claims({ claimed_count: 0 })).verdict, "clean");
});

test("unique ids: rows without id are ignored, ids compared as strings", () => {
  assert.deepEqual(measure(rows({ id: 1 }, { id: "1" }, { x: 1 }, { id: null })), { count: 4, unique_count: 1 });
});

test("parseBody rejects anything that is not {prose: string, rows: object[]}", () => {
  for (const bad of ["", "nope", "[]", "null", '{"rows":[]}', '{"prose":1,"rows":[]}', '{"prose":"x","rows":{}}', '{"prose":"x","rows":[1]}', '{"prose":"x","rows":[null]}', '{"prose":"x","rows":[[]]}']) {
    assert.equal(parseBody(bad), null, bad);
  }
  assert.deepEqual(parseBody('{"prose":"x","rows":[{"id":1}]}'), { prose: "x", rows: [{ id: 1 }] });
});
