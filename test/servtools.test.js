import { test } from "node:test";
import assert from "node:assert/strict";
import { parseServTools, createServComplete } from "../src/serv.js";

test("SERV tools: default disables the content filter only; 'none' and lists work; unknown names throw", () => {
  assert.deepEqual(parseServTools(undefined).map((t) => t.function.name), ["serv_disable_content_filter"]);
  assert.deepEqual(parseServTools("none"), []);
  assert.deepEqual(parseServTools("prompt_guard, disable_content_filter").map((t) => t.function.name), ["serv_prompt_guard", "serv_disable_content_filter"]);
  assert.throws(() => parseServTools("serv_anything"), /unknown SERV tool/);
});

test("SERV tools are sent in the request; prompt guard is not on by default", async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "x", object: "chat.completion", created: 0, model: "m", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "{}" } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await createServComplete({ apiKey: "test", tools: parseServTools(undefined) })([{ role: "user", content: "x" }]);
    await createServComplete({ apiKey: "test", tools: [] })([{ role: "user", content: "x" }]);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(sent[0].tools, [{ type: "function", function: { name: "serv_disable_content_filter" } }]);
  assert.ok(!JSON.stringify(sent[0]).includes("serv_prompt_guard"));
  assert.equal(sent[1].tools, undefined);
});
