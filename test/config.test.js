import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertDistinctOrigins } from "../src/config.js";

test("spec 10: sellers sharing an origin fail the build", () => {
  assert.throws(
    () =>
      assertDistinctOrigins({
        a: "https://sellers.example/v1/a.json",
        b: "https://sellers.example/v1/b.json",
      }),
    /share origin/,
  );
});

test("distinct origins pass; a different port is a different origin", () => {
  assert.doesNotThrow(() =>
    assertDistinctOrigins({ a: "https://a.example/v1/a.json", b: "https://b.example/v1/b.json" }),
  );
  assert.doesNotThrow(() =>
    assertDistinctOrigins({ a: "http://localhost:8091/a.json", b: "http://localhost:8092/b.json" }),
  );
});

test("a missing seller URL is an error", () => {
  assert.throws(() => assertDistinctOrigins({ a: "https://a.example/x", b: null }), /no URL/);
});

test("committed sellers.json: once filled, its origins are distinct", (t) => {
  const sellers = JSON.parse(readFileSync(new URL("../sellers.json", import.meta.url), "utf8"));
  if (Object.values(sellers).some((v) => !v)) {
    t.skip("sellers.json not filled yet (sellers not deployed)");
    return;
  }
  assert.doesNotThrow(() => assertDistinctOrigins(sellers));
});
