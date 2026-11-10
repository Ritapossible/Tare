import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileStore } from "../src/store.js";

const dir = () => mkdtempSync(join(tmpdir(), "tare-store-"));

test("file store persists receipts, blocklist, idempotency and kpass calls across instances", () => {
  const path = join(dir(), "data", "store.json");
  const s1 = fileStore(path);
  s1.put({ id: "r1", origin: "https://a.test", status: "clean", idempotency_key: "https://a.test|k" });
  s1.block("https://b.test", { reason: "dispute" });
  s1.countKpassCall();

  const s2 = fileStore(path);
  assert.equal(s2.byKey("https://a.test|k").id, "r1");
  assert.equal(s2.blockEntry("https://b.test").reason, "dispute");
  assert.equal(s2.kpassCalls(), 1);
});

test("put replaces a receipt by id", () => {
  const s = fileStore(join(dir(), "s.json"));
  s.put({ id: "r1", status: "pending" });
  s.put({ id: "r1", status: "clean" });
  assert.deepEqual(s.receipts().map((r) => r.status), ["clean"]);
});

test("writes are atomic: no temp files left behind", () => {
  const d = dir();
  const s = fileStore(join(d, "s.json"));
  for (let i = 0; i < 20; i++) s.put({ id: `r${i}`, status: "clean" });
  assert.deepEqual(readdirSync(d), ["s.json"]);
  assert.equal(JSON.parse(readFileSync(join(d, "s.json"), "utf8")).receipts.length, 20);
});

test("unblock and reset", () => {
  const s = fileStore(join(dir(), "s.json"));
  s.block("https://a.test", { reason: "dispute" });
  assert.equal(s.unblock("https://a.test"), true);
  assert.equal(s.unblock("https://a.test"), false);
  s.put({ id: "r1" });
  s.reset();
  assert.deepEqual(s.snapshot(), { receipts: [], blocklist: {}, idempotency: {}, kpass_calls: 0, direct_spent_units: "0" });
});
