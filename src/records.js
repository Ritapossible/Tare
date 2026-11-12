// Seller records: one public record per seller origin, built from the local store.
//
// A record says whether a seller is held (a check failed, or its promise had nothing to check) or in
// good standing, and carries the evidence behind that: what was promised, what was delivered, the
// failed checks, the settlement hash and the body / prompt hashes. Other agents read these records as
// an opt-in feed (src/feeds.js). There is no global blacklist: a record only matters to agents that
// choose to trust its publisher.

export const RECORDS_VERSION = 1;
import { TX_HASH as TX } from "./txhash.js";
const JUDGED = new Set(["clean", "dispute", "unverifiable"]);

function evidence(r) {
  if (!r) return null;
  return {
    receipt_id: r.id,
    status: r.status,
    url: r.url,
    promised: r.claims ?? null,
    delivered: r.count == null ? null : { count: r.count, unique_count: r.unique_count },
    failed: r.failed ?? [],
    tx_hash: TX.test(r.tx_hash ?? "") ? r.tx_hash : null, // only a real settlement hash
    ...(r.tx_hash_source === "operator" ? { tx_hash_source: "operator" } : {}),
    body_sha256: r.body_sha256 ?? null,
    prompt_sha256: r.prompt_sha256 ?? null,
    payment_rail: r.payment_rail ?? null,
    promise: r.promise ?? null,
    advertised: r.advertised ?? null,
    explanation: r.explanation ?? null,
    seller_identity: r.seller_identity?.did ? { did: r.seller_identity.did, verified_tier: r.seller_identity.verified_tier ?? null } : null,
    checked_at: r.created_at ?? null,
  };
}

// snapshot = store.snapshot(); returns { version, publisher, generated_at, records: [...] }
export function buildRecords(snapshot, { publisher = "tare", now = () => new Date().toISOString() } = {}) {
  const byOrigin = new Map();
  for (const r of snapshot.receipts ?? []) {
    if (!r?.origin) continue;
    if (!byOrigin.has(r.origin)) byOrigin.set(r.origin, []);
    byOrigin.get(r.origin).push(r);
  }

  const records = [];
  for (const [origin, receipts] of byOrigin) {
    const judged = receipts.filter((r) => JUDGED.has(r.status));
    const hold = snapshot.blocklist?.[origin] ?? null;
    if (!judged.length && !hold) continue; // never checked: no record
    const counts = {
      verified: receipts.filter((r) => r.status === "clean").length,
      disputes: receipts.filter((r) => r.status === "dispute").length,
      unverifiable: receipts.filter((r) => r.status === "unverifiable").length,
      stopped: receipts.filter((r) => r.status === "refused").length,
    };
    if (hold) {
      const cause = receipts.find((r) => r.id === hold.receipt_id) ?? judged[judged.length - 1] ?? null;
      records.push({ origin, status: "held", reason: hold.reason, since: hold.at ?? null, evidence: evidence(cause), counts });
    } else {
      records.push({ origin, status: "in_good_standing", reason: null, since: null, evidence: evidence(judged[judged.length - 1]), counts });
    }
  }
  records.sort((a, b) => a.origin.localeCompare(b.origin));
  return { version: RECORDS_VERSION, publisher, generated_at: now(), records };
}

// A seller earns the "Verified by Tare" badge only when it is in good standing AND has at least one
// verified delivery on record. Held or never-checked sellers never get one.
export function badgeEligible(record) {
  return record?.status === "in_good_standing" && (record.counts?.verified ?? 0) > 0 && record.evidence?.status === "clean";
}

export function badgeFileName(origin) {
  const host = new URL(origin).host.toLowerCase();
  if (!/^[a-z0-9.-]+(:[0-9]+)?$/.test(host)) throw new Error(`unsafe host for a badge file name: ${host}`);
  return `${host.replace(":", "_")}.svg`;
}

export function badgeSvg(record) {
  if (!badgeEligible(record)) throw new Error(`no badge: ${record?.origin} is not verified in good standing`);
  const n = record.counts.verified;
  const right = `verified · ${n} check${n === 1 ? "" : "s"}`;
  const rightW = 14 + right.length * 6.4;
  const w = Math.round(58 + rightW);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="24" viewBox="0 0 ${w} 24" role="img" aria-label="Verified by Tare: ${right}">
<title>Verified by Tare: ${right}</title>
<rect width="${w}" height="24" rx="6" fill="#050505"/>
<rect x="56" width="${w - 56}" height="24" rx="6" fill="#22c55e"/>
<rect x="56" width="8" height="24" fill="#22c55e"/>
<g transform="translate(8 4) scale(0.5)" fill="none"><rect x="3" y="6" width="26" height="8" rx="4" stroke="#f6f6f4" stroke-width="2.6"/><rect x="3" y="18" width="16" height="8" rx="4" fill="#f6f6f4"/><circle cx="25" cy="22" r="3" fill="#f97316"/></g>
<text x="27" y="16" fill="#f6f6f4" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" font-weight="700">Tare</text>
<text x="${56 + rightW / 2}" y="16" fill="#04130a" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">${right}</text>
</svg>
`;
}
