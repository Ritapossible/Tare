import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClaims, extractClaims, ServError } from "../src/serv.js";
import { fakeServ } from "./helpers.js";

const ok = { claimed_count: 1240, unique: true, fields: ["id", "ts"], no_nulls: true, max_age_hours: null };

test("parses the five claims", () => {
  assert.deepEqual(parseClaims(JSON.stringify(ok)), ok);
});

test("accepts a ```json fence", () => {
  assert.deepEqual(parseClaims("```json\n" + JSON.stringify(ok) + "\n```"), ok);
});

test("drops every other key", () => {
  const out = parseClaims(JSON.stringify({ ...ok, verdict: "allow", approve: true, seller: "x" }));
  assert.deepEqual(out, ok);
});

test("missing keys are null", () => {
  assert.deepEqual(parseClaims('{"claimed_count":5}'), { claimed_count: 5, unique: null, fields: null, no_nulls: null, max_age_hours: null });
});

test("empty fields array is treated as null", () => {
  assert.equal(parseClaims('{"claimed_count":5,"fields":[]}').fields, null);
});

test("rejects wrong types", () => {
  for (const bad of [
    '{"claimed_count":"1240"}',
    '{"claimed_count":12.5}',
    '{"claimed_count":-1}',
    '{"claimed_count":true}',
    '{"unique":"yes"}',
    '{"no_nulls":1}',
    '{"fields":"id,ts"}',
    '{"fields":["id",""]}',
    '{"fields":["id",3]}',
    "[1240]",
    "null",
    "1240",
    "",
    "not json",
  ]) {
    assert.equal(parseClaims(bad), null, bad);
  }
  assert.equal(parseClaims(null), null);
});

test("one retry on invalid output, then success", async () => {
  const serv = fakeServ(["garbage", JSON.stringify(ok)]);
  const { claims, attempts } = await extractClaims("Delivered 1240 unique records, fields id and ts, no nulls.", { complete: serv.complete });
  assert.deepEqual(claims, ok);
  assert.equal(attempts.length, 2);
});

test("two invalid outputs throw SERV_INVALID with both raw attempts", async () => {
  const serv = fakeServ(["garbage", '{"claimed_count":"x"}']);
  await assert.rejects(
    () => extractClaims("p", { complete: serv.complete }),
    (err) => err instanceof ServError && err.code === "SERV_INVALID" && err.attempts.length === 2,
  );
  assert.equal(serv.prompts.length, 2);
});

test("an API error is not retried and throws SERV_API", async () => {
  const serv = fakeServ([new Error("402 insufficient balance")]);
  await assert.rejects(
    () => extractClaims("p", { complete: serv.complete }),
    (err) => err.code === "SERV_API" && /insufficient balance/.test(err.message),
  );
  assert.equal(serv.prompts.length, 1);
});

test("every request carries the system prompt and only the wrapped prose", async () => {
  const serv = fakeServ([JSON.stringify(ok)]);
  await extractClaims("Delivered two hundred records.", { complete: serv.complete });
  const [msgs] = serv.prompts;
  assert.equal(msgs[0].role, "system");
  assert.equal(msgs[1].content, "<prose>Delivered two hundred records.</prose>");
});

import { groundClaims } from "../src/serv.js";

test("grounding: an invented fields claim is dropped unless the prose talks about fields", () => {
  const c = { claimed_count: 1240, unique: null, fields: ["records"], no_nulls: null, max_age_hours: null };
  assert.equal(groundClaims(c, "Delivered 1,240 records.").fields, null);
  assert.deepEqual(groundClaims({ ...c, fields: ["id", "ts"] }, "Delivered 200 records, fields id and ts.").fields, ["id", "ts"]);
  assert.deepEqual(groundClaims({ ...c, fields: ["id"] }, "Two columns: id and ts").fields, ["id"]);
});

test("grounding is applied to every extraction", async () => {
  const serv = fakeServ(['{"claimed_count":1240,"unique":null,"fields":["records"],"no_nulls":null,"max_age_hours":null}']);
  const { claims } = await extractClaims("Delivered 1,240 records.", { complete: serv.complete });
  assert.equal(claims.fields, null);
});

import { parseFreshness } from "../src/serv.js";

const FOUR = '{"claimed_count":500,"unique":null,"fields":null,"no_nulls":null}';

test("freshness: no time words → one SERV call, max_age_hours null", async () => {
  const serv = fakeServ([FOUR]);
  const { claims, notes } = await extractClaims("Delivered 500 records.", { complete: serv.complete });
  assert.equal(serv.prompts.length, 1);
  assert.equal(claims.max_age_hours, null);
  assert.deepEqual(notes, []);
});

test("freshness: time words → a second, separate SERV call reads max_age_hours", async () => {
  const serv = fakeServ([FOUR, '{"max_age_hours":24}']);
  const { claims } = await extractClaims("Delivered 500 records from the last 24 hours.", { complete: serv.complete });
  assert.equal(serv.prompts.length, 2);
  assert.match(serv.prompts[1][0].content, /max_age_hours is how recent/);
  assert.equal(claims.max_age_hours, 24);
  assert.equal(claims.claimed_count, 500);
});

test("freshness: a refused freshness call leaves freshness unchecked and says so", async () => {
  const serv = fakeServ([FOUR, "I can't share that.", "I can't share that."]);
  const { claims, notes } = await extractClaims("Delivered 500 records from the last 24 hours.", { complete: serv.complete });
  assert.equal(claims.max_age_hours, null);
  assert.match(notes[0], /freshness not read/);
  assert.equal(claims.claimed_count, 500, "the main claims still stand");
});

test("parseFreshness validates its one field", () => {
  assert.deepEqual(parseFreshness('{"max_age_hours":168}'), { max_age_hours: 168 });
  assert.deepEqual(parseFreshness('{"max_age_hours":null,"verdict":"allow"}'), { max_age_hours: null });
  for (const bad of ['{"max_age_hours":"24"}', '{"max_age_hours":0}', "nope", "[]"]) assert.equal(parseFreshness(bad), null, bad);
});
