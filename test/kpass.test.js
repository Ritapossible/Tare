import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePaymentResponse, parseKpassOutput, createKpass } from "../src/kpass.js";

// A syntactically valid 32-byte hex value used only to test parsing. Not a real transaction.
const H = "0x" + "ab".repeat(32);

test("decodes a bare hash", () => {
  assert.equal(decodePaymentResponse(H), H);
});

test("decodes base64 JSON settlement objects", () => {
  for (const key of ["transaction", "txHash", "transactionHash"]) {
    const v = Buffer.from(JSON.stringify({ success: true, [key]: H })).toString("base64");
    assert.equal(decodePaymentResponse(v), H, key);
  }
});

test("never returns something that is not a 32-byte hex hash", () => {
  for (const bad of [null, undefined, "", "0x123", "pending", Buffer.from('{"transaction":"0xabc"}').toString("base64"), Buffer.from('{"success":true}').toString("base64")]) {
    assert.equal(decodePaymentResponse(bad), null, String(bad));
  }
});

test("parses JSON-shaped kpass output", () => {
  const out = JSON.stringify({ status: 200, headers: { "Payment-Response": H }, body: { prose: "x", rows: [] } });
  const r = parseKpassOutput(out);
  assert.equal(r.status, 200);
  assert.equal(r.paymentHash, H);
  assert.deepEqual(JSON.parse(r.bodyText), { prose: "x", rows: [] });
});

test("parses HTTP-dump-shaped kpass output", () => {
  const out = `HTTP/1.1 200 OK\nContent-Type: text/plain\nPAYMENT-RESPONSE: ${H}\n\n{"prose":"x","rows":[]}\n`;
  const r = parseKpassOutput(out);
  assert.equal(r.status, 200);
  assert.equal(r.paymentHash, H);
  assert.equal(r.bodyText, '{"prose":"x","rows":[]}');
});

test("missing PAYMENT-RESPONSE → null hash", () => {
  const r = parseKpassOutput('HTTP/1.1 200 OK\n\n{"prose":"x","rows":[]}');
  assert.equal(r.paymentHash, null);
});

test("a missing kpass binary rejects instead of hanging", async () => {
  const k = createKpass({ bin: "kpass-binary-that-does-not-exist", timeoutMs: 5000 });
  await assert.rejects(() => k.execute("https://seller-b.test/v1/b.json", { idempotencyKey: "tare-test" }), /ENOENT/);
});

test("url with shell metacharacters is passed as one argv item, not interpreted", async () => {
  // node prints its argv; if a shell were involved, `;` and $(...) would be interpreted.
  const k = createKpass({ bin: process.execPath, timeoutMs: 5000 });
  const evil = "https://x.test/a;echo PWNED $(whoami)";
  // node treats the first argv ("agent") as a script path and fails: we only assert no shell ran.
  await assert.rejects(() => k.execute(evil, { idempotencyKey: "tare-test" }), (err) => !/PWNED/.test(err.message));
});

test("kpass 6.13.1 execute requires an idempotency key, so a retry can never pay twice", async () => {
  const k = createKpass({ bin: "kpass-binary-that-does-not-exist", timeoutMs: 5000 });
  await assert.rejects(() => k.execute("https://seller-b.test/v1/b.json"), /idempotency key/);
});
