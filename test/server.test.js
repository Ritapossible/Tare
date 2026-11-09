import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server.js";
import { setup, A_URL, B_URL } from "./helpers.js";

let server, base, port, t;

before(async () => {
  t = setup();
  server = createApp({ tare: { store: t.store, buy: t.buy }, sellers: { a: A_URL, b: B_URL, c: null }, webRoot: "web" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});
after(() => server.close());

const buy = (body, headers = {}) =>
  fetch(`${base}/api/buy`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tare-request": "1", ...headers },
    body: JSON.stringify(body),
  });

test("serves pages with clean URLs", async () => {
  for (const p of ["/", "/app", "/app/receipt", "/app/sellers", "/docs"]) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("content-type"), /text\/html/);
  }
});

test("path traversal never escapes web/", async () => {
  for (const p of ["/../package.json", "/%2e%2e/package.json", "/..%2fpackage.json", "/%00"]) {
    const r = await fetch(base + p);
    assert.equal(r.status, 404, p);
    assert.doesNotMatch(await r.text(), /"openai"/);
  }
});

test("state endpoint reports live mode", async () => {
  const s = await (await fetch(`${base}/api/state`)).json();
  assert.equal(s.mode, "live");
  assert.equal(s.sellers.a, A_URL);
  assert.match(s.seller_labels.a, /one thousand two hundred forty/);
});

test("buy without the custom header is refused (CSRF)", async () => {
  const r = await fetch(`${base}/api/buy`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"seller":"a"}' });
  assert.equal(r.status, 403);
  assert.equal(t.kpass.calls.length, 0);
});

test("buy as a form post is refused", async () => {
  const r = await fetch(`${base}/api/buy`, { method: "POST", headers: { "content-type": "text/plain", "x-tare-request": "1" }, body: '{"seller":"a"}' });
  assert.equal(r.status, 415);
  assert.equal(t.kpass.calls.length, 0);
});

test("buy from another origin is refused", async () => {
  const r = await buy({ seller: "a" }, { origin: "https://evil.example" });
  assert.equal(r.status, 403);
  assert.equal(t.kpass.calls.length, 0);
});

test("a foreign Host header is refused (DNS rebinding)", async () => {
  const { request } = await import("node:http");
  const status = await new Promise((resolve) => {
    request({ host: "127.0.0.1", port, path: "/api/state", headers: { host: `evil.example:${port}` } }, (res) => resolve(res.statusCode)).end();
  });
  assert.equal(status, 421);
});

test("the browser can only name a configured seller, never a URL", async () => {
  assert.equal((await buy({ seller: "https://evil.example/x" })).status, 400);
  assert.equal((await buy({ seller: "__proto__" })).status, 400);
  assert.equal((await buy({ seller: "c" })).status, 409);
  assert.equal((await buy({ seller: "a", request_id: "../../x" })).status, 400);
  assert.equal(t.kpass.calls.length, 0);
});

test("A → A → B through the API: dispute, refused, clean; kpass called twice", async () => {
  const r1 = (await (await buy({ seller: "a", request_id: "r1" })).json()).receipt;
  const r2 = (await (await buy({ seller: "a", request_id: "r2" })).json()).receipt;
  const r3 = (await (await buy({ seller: "b", request_id: "r3" })).json()).receipt;
  assert.deepEqual([r1.status, r2.status, r3.status], ["dispute", "refused", "clean"]);
  assert.equal(t.kpass.calls.length, 2);
  const s = await (await fetch(`${base}/api/state`)).json();
  assert.equal(s.kpass_calls, 2);
  // same request id again: replayed, no new payment
  const again = (await (await buy({ seller: "b", request_id: "r3" })).json()).receipt;
  assert.equal(again.replayed, true);
  assert.equal(t.kpass.calls.length, 2);
});
