// Pure rendering helpers (no DOM). Everything that came from a seller or from SERV is escaped.
// Imported by the browser and by node tests.

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export const STATUS = {
  clean: { label: "Verified", tone: "ok", note: "Every claim matched the delivery. The seller stays in good standing." },
  dispute: { label: "Dispute", tone: "bad", note: "A claim failed against the delivery. The seller is now held." },
  unverifiable: { label: "Unverifiable", tone: "warn", note: "The promise made no count claim to check. The seller is now held." },
  refused: { label: "Stopped", tone: "muted", note: "Stopped before kpass. Nothing was paid." },
  failed: { label: "Failed", tone: "muted", note: "kpass did not complete a payment." },
  paid_unverified: { label: "Paid, no hash", tone: "warn", note: "kpass returned no PAYMENT-RESPONSE hash, so the delivery was not judged." },
  paid_unchecked: { label: "Paid, unchecked", tone: "warn", note: "Paid, but SERV could not read the promise. Not checked; the seller record is unchanged." },
  pending: { label: "Pending", tone: "warn", note: "Payment started and did not finish." },
};

export function statusChip(status) {
  const s = STATUS[status] ?? { label: status, tone: "muted" };
  return `<span class="chip tone-${s.tone}">${esc(s.label)}</span>`;
}

const TX = /^0x[0-9a-fA-F]{64}$/;

export function isTxHash(hash) {
  return typeof hash === "string" && TX.test(hash);
}

// What to say when a receipt has no valid settlement hash, consistent with its status.
export function noHashLabel(status) {
  if (status === "paid_unverified") return "paid, no hash";
  if (status === "pending") return "outcome unknown";
  if (status === "refused" || status === "failed" || status === undefined || status === null) return "not paid";
  return "no valid hash";
}

// Only a 0x + 64 hex value is ever shown as a hash.
export function txCell(hash, status) {
  if (!isTxHash(hash)) return `<span class="faint">${esc(noHashLabel(status))}</span>`;
  return `<span class="hash" title="${esc(hash)}">${esc(shortHash(hash))}</span>`;
}

// Full hash for the receipt detail page (same validation as txCell).
export function settlementCell(r) {
  if (!isTxHash(r?.tx_hash)) return txCell(null, r?.status);
  return `<span class="hash">${esc(r.tx_hash)}</span><button class="copy" data-copy="${esc(r.tx_hash)}">copy</button>`;
}

export function shortHash(h) {
  if (!h) return "";
  return h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}

export function sellerName(origin, sellers = {}) {
  for (const [key, url] of Object.entries(sellers)) {
    try {
      if (url && new URL(url).origin === origin) return `Seller ${key.toUpperCase()}`;
    } catch {
      /* ignore bad URLs */
    }
  }
  try {
    return new URL(origin).host;
  } catch {
    return String(origin ?? "");
  }
}

export function claimedCount(r) {
  return r?.claims?.claimed_count ?? null;
}

// One row per rule for the receipt detail page.
export function ruleRows(r) {
  const failed = new Set(r?.failed ?? []);
  const c = r?.claims ?? null;
  const judged = r?.status === "clean" || r?.status === "dispute" || r?.status === "unverifiable";
  const result = (rule, claimed) => {
    if (failed.has(rule)) return "fail";
    if (!judged) return "none";
    return claimed ? "pass" : "none";
  };

  if (failed.has("shape")) {
    return [{ rule: "shape", claimed: "a JSON body with prose and rows", measured: "unreadable body", result: "fail" }];
  }

  const rows = [];
  const cc = c?.claimed_count ?? null;
  const measuredCount = c?.unique === true ? r?.unique_count : r?.count;
  rows.push({
    rule: "count",
    claimed: cc === null ? "not claimed" : `${cc}${c?.unique === true ? " unique" : ""} records`,
    measured: measuredCount == null ? "-" : `${measuredCount}${c?.unique === true ? " unique" : ""} records`,
    result: result("count", cc !== null),
  });
  rows.push({
    rule: "unique",
    claimed: c?.unique === true ? "all ids unique" : "not claimed",
    measured: r?.count == null ? "-" : `${r.unique_count} unique of ${r.count}`,
    result: result("unique", c?.unique === true),
  });
  rows.push({
    rule: "fields",
    claimed: c?.fields ? c.fields.join(", ") : "not claimed",
    measured: !c?.fields || !judged ? "-" : failed.has("fields") ? "missing in some rows" : "present in every row",
    result: result("fields", Boolean(c?.fields)),
  });
  if (c?.max_age_hours != null || failed.has("fresh")) {
    rows.push({
      rule: "fresh",
      claimed: c?.max_age_hours != null ? `within ${c.max_age_hours} h` : "not claimed",
      measured: r?.oldest_age_hours != null ? `oldest record ${r.oldest_age_hours} h old` : "no usable timestamps",
      result: result("fresh", c?.max_age_hours != null),
    });
  }
  rows.push({
    rule: "no_nulls",
    claimed: c?.no_nulls === true ? "no nulls" : "not claimed",
    measured: c?.no_nulls !== true || !judged ? "-" : failed.has("no_nulls") ? "null or empty values found" : "none found",
    result: result("no_nulls", c?.no_nulls === true),
  });
  return rows;
}

// Checks of the seller's 402 advertisement (made before payment), as separate rows.
export function advertisedRows(r) {
  const c = r?.advertised_claims;
  if (!c) return [];
  const failed = new Set((r.failed ?? []).filter((f) => f.startsWith("advertised:")).map((f) => f.slice(11)));
  const rows = [];
  if (c.claimed_count != null) rows.push({ rule: "advertised:count", claimed: `${c.claimed_count}${c.unique === true ? " unique" : ""} records`, result: failed.has("count") ? "fail" : "pass" });
  if (c.unique === true) rows.push({ rule: "advertised:unique", claimed: "all ids unique", result: failed.has("unique") ? "fail" : "pass" });
  if (c.fields) rows.push({ rule: "advertised:fields", claimed: c.fields.join(", "), result: failed.has("fields") ? "fail" : "pass" });
  if (c.no_nulls === true) rows.push({ rule: "advertised:no_nulls", claimed: "no nulls", result: failed.has("no_nulls") ? "fail" : "pass" });
  if (c.max_age_hours != null) rows.push({ rule: "advertised:fresh", claimed: `within ${c.max_age_hours} h`, result: failed.has("fresh") ? "fail" : "pass" });
  return rows;
}

// The seller's own words, verbatim and escaped: what it said in the delivery and in its 402.
export function promiseHTML(r) {
  const block = (label, text, sub) =>
    text ? `<figure class="promise"><figcaption><span class="k">${esc(label)}</span><span class="faint">${esc(sub)}</span></figcaption><blockquote>${esc(text)}</blockquote></figure>` : "";
  const html = block("In the delivery", r?.promise, "the seller's prose, read by SERV") + block("In the 402 advertisement", r?.advertised, "made before any money moved");
  return html || `<p class="dim">No promise text recorded for this receipt.</p>`;
}

export function failedTags(failed) {
  if (!failed?.length) return `<span class="faint">-</span>`;
  return `<span class="failed-list">${failed.map((f) => `<span class="rule-tag">${esc(f)}</span>`).join("")}</span>`;
}

export function receiptRow(r, state) {
  const blocked = state?.blocklist?.[r.origin];
  const name = sellerName(r.origin, state?.sellers);
  const cc = claimedCount(r);
  return `<tr>
  <td data-k="Seller"><a class="row-link" href="/app/receipt?id=${encodeURIComponent(r.id)}">${esc(name)}</a><div class="faint hash">${esc(r.origin)}</div></td>
  <td data-k="Status">${statusChip(r.status)}</td>
  <td data-k="Claimed"><span class="num">${esc(cc ?? "-")}</span></td>
  <td data-k="Counted"><span class="num">${r.count ?? "-"}</span>${r.unique_count != null ? `<div class="faint">${esc(r.unique_count)} unique</div>` : ""}</td>
  <td data-k="Failed">${failedTags(r.failed)}</td>
  <td data-k="Tx hash">${txCell(r.tx_hash, r.status)}</td>
  <td data-k="Seller record">${recordCell(blocked)}</td>
</tr>`;
}

// Mobile receipt card: leads with promised → delivered. `preview` cards (empty published console)
// carry no hash and say so.
export function receiptCard(r, state, { preview = false } = {}) {
  const tone = (STATUS[r.status] ?? { tone: "muted" }).tone;
  const name = sellerName(r.origin, state?.sellers);
  const cc = claimedCount(r);
  const uniq = r?.claims?.unique === true;
  const delivered = uniq ? r.unique_count : r.count;
  const judged = r.count != null;
  const blocked = state?.blocklist?.[r.origin];
  const tag = preview ? "div" : "a";
  const href = preview ? "" : ` href="/app/receipt?id=${encodeURIComponent(r.id)}"`;
  const nums = judged
    ? `<div class="rcard-nums">
        <div><span class="k">Promised</span><span class="big">${esc(cc ?? "-")}</span></div>
        <span class="rcard-arrow" aria-hidden="true">→</span>
        <div><span class="k">Delivered</span><span class="big ${r.failed?.length ? "tone-bad" : ""}">${delivered ?? "-"}</span>${uniq ? `<span class="sub">unique of ${esc(r.count)}</span>` : ""}</div>
      </div>`
    : `<p class="rcard-note">${esc((STATUS[r.status] ?? {}).note ?? "")}</p>`;
  const hash = preview
    ? `<span class="faint">${r.status === "refused" ? "not paid" : "testnet hash after a live run"}</span>`
    : txCell(r.tx_hash, r.status);
  return `<${tag} class="rcard bar-${tone}${preview ? " is-preview" : ""}"${href}>
    <div class="rcard-top"><span class="rcard-seller">${esc(name)}</span>${statusChip(r.status)}</div>
    ${nums}
    ${r.failed?.length ? `<div class="rcard-failed">${failedTags(r.failed)}</div>` : ""}
    <div class="rcard-foot">
      <div><span class="k">Tx hash</span>${hash}</div>
      <div><span class="k">Seller record</span>${preview ? (r.status === "clean" ? `<span class="faint">in good standing</span>` : `<span class="tone-bad">held · dispute</span>`) : recordCell(blocked)}</div>
    </div>
  </${tag}>`;
}

// What a run looks like, from the committed seller payloads. No hashes.
export const PREVIEW_RECEIPTS = [
  { id: "p1", origin: "seller-a", status: "dispute", claims: { claimed_count: 1240, unique: true }, count: 1240, unique_count: 860, failed: ["count", "unique", "no_nulls"] },
  { id: "p2", origin: "seller-a", status: "refused", failed: [] },
  { id: "p3", origin: "seller-b", status: "clean", claims: { claimed_count: 200, unique: null }, count: 200, unique_count: 200, failed: [] },
];

// Everything the Sellers page knows about one seller, derived from receipts (no network).
export function sellerSummary(state, key) {
  const url = state?.sellers?.[key] ?? null;
  let origin = null;
  try {
    origin = url ? new URL(url).origin : null;
  } catch {
    origin = null;
  }
  const mine = origin ? (state?.receipts ?? []).filter((r) => r.origin === origin) : [];
  const count = (s) => mine.filter((r) => r.status === s).length;
  const judged = mine.filter((r) => r.status === "clean" || r.status === "dispute" || r.status === "unverifiable");
  const hold = origin ? state?.blocklist?.[origin] ?? null : null;
  return {
    key,
    url,
    origin,
    hold,
    holdReceipt: hold ? mine.find((r) => r.id === hold.receipt_id) ?? null : null,
    verified: count("clean"),
    // Same definition as the console's Disputes tile: promises that failed a check. An
    // "unverifiable" hold is shown by the record banner, not counted as a dispute.
    disputes: count("dispute"),
    stopped: count("refused"),
    lastCheck: judged[judged.length - 1] ?? null,
    promise: state?.seller_labels?.[key] ?? null,
  };
}

export function sellerProfileCard(s, icons = {}) {
  const name = `Seller ${String(s.key).toUpperCase()}`;
  let banner;
  if (!s.url) banner = `<div class="record-banner tone-muted-bg"><strong>Not deployed yet</strong><span>No URL in sellers.json.</span></div>`;
  else if (s.hold)
    banner = `<div class="record-banner bad"><strong>Held · ${esc(s.hold.reason)}</strong><span>The next buy stops before kpass.${
      s.holdReceipt ? ` <a href="/app/receipt?id=${encodeURIComponent(s.holdReceipt.id)}">See the receipt</a>` : ""
    }</span></div>`;
  else banner = `<div class="record-banner ok"><strong>In good standing</strong><span>${s.verified ? "Every check so far matched the promise." : "No failed check on record."}</span></div>`;

  const lc = s.lastCheck;
  const uniq = lc?.claims?.unique === true;
  const delivered = lc ? (uniq ? lc.unique_count : lc.count) : null;
  const last = lc
    ? `<a class="last-check" href="/app/receipt?id=${encodeURIComponent(lc.id)}">
        <span class="k">Last check</span>
        <span class="lc-nums"><span class="big">${esc(lc.claims?.claimed_count ?? "-")}</span><span class="arrow" aria-hidden="true">→</span><span class="big ${lc.failed?.length ? "tone-bad" : ""}">${esc(delivered ?? "-")}</span></span>
        <span class="sub"><span>promised → delivered${uniq ? " (unique)" : ""}</span>${statusChip(lc.status)}</span>
      </a>`
    : `<div class="last-check empty-check"><span class="k">Last check</span><span class="sub">No check ${s.url ? "recorded" : "published"} yet.</span></div>`;

  return `<article class="seller seller-${esc(s.key)} profile">
    <div class="seller-top"><span class="seller-name">${esc(name)}</span>${recordChip(s.hold, Boolean(s.url))}</div>
    ${banner}
    ${s.promise ? `<p class="prose">${esc(s.promise)}</p>` : ""}
    <div class="track">
      <div class="t ${s.verified ? "t-ok" : "t-zero"}"><span class="n">${s.verified}</span><span class="l">Verified</span></div>
      <div class="t ${s.disputes ? "t-bad" : "t-zero"}"><span class="n">${s.disputes}</span><span class="l">Disputes</span></div>
      <div class="t ${s.stopped ? "t-muted" : "t-zero"}"><span class="n">${s.stopped}</span><span class="l">Stopped</span></div>
    </div>
    ${last}
    <details class="conn">
      <summary>Connection details ${icons.chevron ?? ""}</summary>
      <dl class="facts">
        <div><dt>Origin · seller record key</dt><dd><span class="hash">${esc(s.origin ?? "-")}</span></dd></div>
        <div><dt>Buyer URL</dt><dd><span class="hash">${esc(s.url ?? "not set in sellers.json")}</span></dd></div>
        <div><dt>Price</dt><dd>0.001 pieUSD per call · Kite testnet</dd></div>
      </dl>
    </details>
  </article>`;
}

// User-facing name for the internal blocklist: the seller record.
export function recordCell(entry) {
  return entry ? `<span class="tone-bad">held · ${esc(entry.reason)}</span>` : `<span class="faint">in good standing</span>`;
}

export function recordChip(entry, hasUrl = true) {
  if (entry) return `<span class="chip tone-bad">held · ${esc(entry.reason)}</span>`;
  return hasUrl ? `<span class="chip tone-ok">in good standing</span>` : `<span class="chip tone-muted">not deployed</span>`;
}

export function formatTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

// Everything a receipt says about how it was read: claims SERV gave that code dropped, the 402
// advertisement, trusted feeds, and how the body was hashed. Plain text; render through esc().
export function receiptNotes(r) {
  return [
    ...(r?.serv_notes ?? []).map((n) => ["Reading", n]),
    ...(r?.ad_notes ?? []).map((n) => ["402 advertisement", n]),
    ...(r?.feed_notes ?? []).map((n) => ["Trusted feed", n]),
    ...(r?.body_notes ?? []).map((n) => ["Body hash", n]),
  ];
}

export function receiptNotesHTML(r) {
  const notes = receiptNotes(r);
  if (!notes.length) return "";
  return `<div><dt>Notes</dt><dd><ul class="notes">${notes.map(([k, n]) => `<li><span class="k">${esc(k)}</span> ${esc(n)}</li>`).join("")}</ul></dd></div>`;
}
