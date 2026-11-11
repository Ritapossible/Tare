// Trusted seller-record feeds (opt-in). The operator lists the feeds it trusts in TARE_FEEDS
// (comma-separated https URLs of records.json files). Before each buy Tare reads them; a seller held in
// any trusted feed is stopped before payment unless a human explicitly allows the buy.
//
// Failure rules: an unreachable or malformed feed never blocks a buy by itself, and never silently:
// the receipt carries a note for every feed problem. Malformed records are ignored one by one.
//
// Paid feeds: a feed may sit behind x402 (HTTP 402). Tare pays for a lookup only when the operator
// passes payFetch (TARE_PAY_FEEDS=1); the payment goes through the same rail and caps as any buy,
// and its settlement hash is written on the receipt. A read is cached for cacheMs, so a run of
// buys does not pay for the same feed again and again.
//
// Identity: an entry may pin its publisher, "url#0x…" (an address) or "url#did:kite:…" (a Kite
// agent; its active keys are read from Kite Passport). A pinned feed whose signature does not check
// out is ignored, with a note. An unpinned feed is used as before; if it is signed, the receipt
// names the signer.

import { RECORDS_VERSION } from "./records.js";
import { splitPin, verifyFeedIdentity } from "./identity.js";

export function parseFeedList(value) {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((u) => {
      try {
        return new URL(u).protocol === "https:" || new URL(u).hostname === "127.0.0.1";
      } catch {
        return false;
      }
    });
}

// Returns { records: Map(origin → record), ignored: number } from untrusted JSON.
export function validateFeed(json) {
  const out = new Map();
  let ignored = 0;
  if (!json || typeof json !== "object" || json.version !== RECORDS_VERSION || !Array.isArray(json.records)) {
    throw new Error("not a Tare records feed (version 1)");
  }
  for (const r of json.records) {
    let origin = null;
    try {
      origin = new URL(r?.origin).origin;
    } catch {
      origin = null;
    }
    const ok =
      origin &&
      origin === r.origin &&
      (r.status === "held" || r.status === "in_good_standing") &&
      (r.status !== "held" || typeof r.reason === "string");
    if (!ok) {
      ignored++;
      continue;
    }
    out.set(origin, { origin, status: r.status, reason: r.reason ?? null, since: r.since ?? null });
  }
  return { records: out, ignored };
}

// fetchImpl and payFetch are injected (tests never hit the network).
// payFetch(url) → { status, bodyText, paymentHash } pays an x402 feed; without it a paid feed is noted, not paid.
// Returns check(origin) → { hold: {source, reason, since} | null, notes: [] }
export function createFeedChecker({ feeds = [], fetchImpl = globalThis.fetch, payFetch = null, timeoutMs = 10_000, cacheMs = 5 * 60_000, now = Date.now } = {}) {
  const cache = new Map(); // source → { at, json, identity }

  async function read(source, notes) {
    const hit = cache.get(source);
    if (hit && now() - hit.at < cacheMs) return hit;
    const { url, pin } = splitPin(source);
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    let json;
    if (res.status === 402) {
      if (!payFetch) throw new Error("HTTP 402: this feed charges per lookup; set TARE_PAY_FEEDS=1 to pay for it");
      const paid = await payFetch(url);
      if (paid.status !== 200) throw new Error(`paid lookup returned HTTP ${paid.status}`);
      notes.push(`feed ${source}: paid lookup, settlement ${paid.paymentHash ?? "returned no hash"}`);
      json = JSON.parse(paid.bodyText ?? "");
    } else {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
    }
    const signed = Boolean(json?.signature);
    const identity = pin || signed ? await verifyFeedIdentity(json, pin, { fetchImpl }) : null;
    const entry = { at: now(), json, identity, pin };
    cache.set(source, entry);
    return entry;
  }

  return async function check(origin) {
    const notes = [];
    let hold = null;
    for (const source of feeds) {
      let json;
      try {
        const got = await read(source, notes);
        json = got.json;
        const id = got.identity;
        if (got.pin && !id?.ok) {
          notes.push(`feed ${source} ignored: identity not verified (${id?.reason ?? "no signature"})`);
          continue;
        }
        if (id?.ok) notes.push(`feed ${source}: signed by ${id.did ? `${id.did} (${id.signer}, an active key in Kite Passport)` : id.signer}${id.pinned ? ", verified" : ", signer not pinned"}`);
        else if (id && !got.pin) notes.push(`feed ${source}: signature does not check out (${id.reason}); used unpinned`);
      } catch (err) {
        notes.push(`feed ${source} unreachable: ${err?.message ?? err}`);
        continue;
      }
      let parsed;
      try {
        parsed = validateFeed(json);
      } catch (err) {
        notes.push(`feed ${source} ignored: ${err.message}`);
        continue;
      }
      if (parsed.ignored) notes.push(`feed ${source}: ${parsed.ignored} malformed record(s) ignored`);
      const rec = parsed.records.get(origin);
      if (rec?.status === "held" && !hold) hold = { source, reason: rec.reason, since: rec.since };
    }
    return { hold, notes };
  };
}
