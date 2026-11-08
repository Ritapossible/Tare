// Deterministic seller payloads. Writes sellers/data/a.json and sellers/data/b.json.
//
//   node sellers/generate.mjs           # write the files
//   node sellers/generate.mjs --check   # exit 1 if the committed files differ from the generator
//
// Seller A (short and dirty): 1240 rows, 380 of them reuse an earlier id (860 unique), 40 rows
// have ts: null. Its prose claims 1240 unique records with no nulls.
// Seller B (clean): 200 rows, distinct ids, every field set.
//
// The generator asserts its own counts with plain loops so a bad edit cannot ship a payload that
// silently disagrees with SPEC.md. It does not use src/check.js on purpose.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "data");

export const SELLER_A_PROSE =
  "Delivered one thousand two hundred forty unique records, fields id and ts, no nulls.";
export const SELLER_B_PROSE = "Delivered two hundred records, fields id and ts, no nulls.";

const BASE_TS = Date.UTC(2026, 10, 1, 0, 0, 0); // 2026-11-01T00:00:00Z

const id = (n) => `r-${String(n).padStart(4, "0")}`;
const ts = (i) => new Date(BASE_TS + i * 60_000).toISOString().replace(".000Z", "Z");

// mulberry32: tiny seeded PRNG so the shuffle is identical on every machine.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, seed) {
  const rand = rng(seed);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildSellerA() {
  // 860 distinct ids, then 380 repeats of r-0001..r-0380, shuffled so duplicates are interleaved.
  const ids = [];
  for (let n = 1; n <= 860; n++) ids.push(id(n));
  for (let n = 1; n <= 380; n++) ids.push(id(n));
  const order = shuffle(ids, 0x7a4e);
  // Every 31st row (positions 30, 61, …, 1239) gets ts: null → exactly 40 rows.
  const rows = order.map((rowId, i) => ({ id: rowId, ts: i % 31 === 30 ? null : ts(i) }));
  return { prose: SELLER_A_PROSE, rows };
}

export function buildSellerB() {
  const rows = [];
  for (let i = 0; i < 200; i++) rows.push({ id: id(i + 1), ts: ts(i) });
  return { prose: SELLER_B_PROSE, rows };
}

// One row per line: readable diffs, stable bytes (the buyer hashes the raw body).
export function serialize(payload) {
  const lines = payload.rows.map((r) => "    " + JSON.stringify(r));
  return `{\n  "prose": ${JSON.stringify(payload.prose)},\n  "rows": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

function stats(rows) {
  const ids = new Set();
  let nullTs = 0;
  for (const r of rows) {
    ids.add(r.id);
    if (r.ts === null) nullTs++;
  }
  return { count: rows.length, unique: ids.size, nullTs };
}

function assertStats(name, rows, want) {
  const got = stats(rows);
  for (const k of Object.keys(want)) {
    if (got[k] !== want[k]) throw new Error(`${name}: ${k} is ${got[k]}, expected ${want[k]}`);
  }
}

export function buildAll() {
  const a = buildSellerA();
  const b = buildSellerB();
  assertStats("seller A", a.rows, { count: 1240, unique: 860, nullTs: 40 });
  assertStats("seller B", b.rows, { count: 200, unique: 200, nullTs: 0 });
  return { "a.json": serialize(a), "b.json": serialize(b) };
}

function main() {
  const files = buildAll();
  const check = process.argv.includes("--check");
  let drift = false;
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    const path = join(OUT_DIR, name);
    if (check) {
      let current = null;
      try {
        current = readFileSync(path, "utf8");
      } catch {}
      if (current !== text) {
        console.error(`${name} differs from the generator. Run: node sellers/generate.mjs`);
        drift = true;
      }
    } else {
      writeFileSync(path, text);
      console.log(`wrote sellers/data/${name} (${Buffer.byteLength(text)} bytes)`);
    }
  }
  if (drift) process.exit(1);
  if (check) console.log("seller payloads match the generator");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
