import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClaims, extractClaims, ServError } from "../src/serv.js";
import { fakeServ } from "./helpers.js";

const ok = { claimed_count: 1240, unique: true, fields: ["id", "ts"], no_nulls: true };

test("parses the four claims", () => {
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
  assert.deepEqual(parseClaims('{"claimed_count":5}'), { claimed_count: 5, unique: null, fields: null, no_nulls: null });
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
  const { claims, attempts } = await extractClaims("p", { complete: serv.complete });
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
