// Real-seller probe: what do public x402 sellers promise in their own advertisements?
//
//   node scripts/real_probe.mjs [pages=10] [sample=30]
//
// Reads the public x402 discovery list (no payment, no request to any seller), keeps each listed
// resource's own `description` (the same text its 402 response advertises), and runs Tare's claim
// extraction on a deterministic sample of descriptions that mention numbers, fields or time.
// Nothing is paid and nothing is judged: without a delivery there is nothing to count. The output
// says which promises Tare could check after a delivery, and which ones it would misread.
//
// Claims are shown after Tare's code-side grounding, with a note when SERV's claims were dropped.
// Descriptions are untrusted seller text: they go to SERV inside <prose> like any other promise.

import { fileURLToPath } from "node:url";
import { extractClaims, createServComplete } from "../src/serv.js";
import { TIME_WORDS } from "../src/prompt.js";
import { loadEnv } from "../src/tare.js";

const DISCOVERY = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";
const UP_TO = /\b(up to|at most|max(imum)?|as many as)\s+\d/i;
const NUMBER = /\b\d[\d,.]*\b/;
const FIELDS = /\b(fields?|columns?|keys?|attributes?|properties)\b/i;

export function pickSample(items, n) {
  const seen = new Set();
  const out = [];
  const interesting = (d) => NUMBER.test(d) || FIELDS.test(d) || TIME_WORDS.test(d);
  // Deterministic: the order the list returns, one resource per host.
  for (const it of items) {
    const d = (it.description ?? "").trim();
    let host;
    try { host = new URL(it.resource).host; } catch { continue; }
    if (!d || seen.has(host) || !interesting(d)) continue;
    seen.add(host);
    out.push({ host, resource: it.resource, description: d.slice(0, 500) });
    if (out.length >= n) break;
  }
  return out;
}

async function main() {
  loadEnv();
  const pages = Number(process.argv[2] ?? 10);
  const n = Number(process.argv[3] ?? 30);
  let items = [];
  for (let p = 0; p < pages; p++) {
    const res = await fetch(`${DISCOVERY}?limit=100&offset=${p * 100}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`discovery list HTTP ${res.status}`);
    const j = await res.json();
    items = items.concat(j.items ?? []);
    if (p === 0) console.log(`listed resources: ${j.pagination?.total ?? "?"}`);
  }
  const sample = pickSample(items, n);
  console.log(`read ${items.length} listings · sampled ${sample.length} sellers (one per host)\n`);

  const complete = createServComplete({ apiKey: process.env.SERV_API_KEY });
  const tally = { count: 0, upToRead: 0, upToExact: 0, fields: 0, fresh: 0, nothing: 0, error: 0, droppedTexts: 0 };
  for (const s of sample) {
    let r;
    try {
      r = await extractClaims(s.description, { complete });
    } catch (err) {
      tally.error++;
      console.log(`ERR   ${s.host}: ${err.code ?? err.message}`);
      continue;
    }
    const c = r.claims;
    const upTo = UP_TO.test(s.description);
    if (c.claimed_count !== null) tally.count++;
    if (upTo) tally.upToRead++;
    if (upTo && c.claimed_count !== null) tally.upToExact++;
    if (c.fields) tally.fields++;
    if (c.max_age_hours !== null) tally.fresh++;
    if (Object.values(c).every((v) => v === null)) tally.nothing++;
    const dropNote = (r.notes ?? []).find((x) => x.startsWith("claims dropped"));
    if (dropNote) tally.droppedTexts++;
    console.log(`${s.host}\n  "${s.description.slice(0, 160).replace(/\s+/g, " ")}${s.description.length > 160 ? "…" : ""}"\n  → ${JSON.stringify(c)}${upTo ? "  [says 'up to']" : ""}${dropNote ? `\n  (${dropNote})` : ""}`);
  }
  console.log(`\nsummary over ${sample.length}: exact count claimed ${tally.count} · fields ${tally.fields} · time window ${tally.fresh} · nothing checkable ${tally.nothing} · SERV error ${tally.error}`);
  console.log(`texts where code dropped claims SERV invented: ${tally.droppedTexts}`);
  console.log(`"up to N" texts: ${tally.upToRead}, of which read as an exact count: ${tally.upToExact}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
