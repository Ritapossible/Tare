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

// Only a 0x + 64 hex value from kpass is shown as a hash. Anything else renders as "not paid".
export function txCell(hash) {
  if (!hash || !TX.test(hash)) return `<span class="faint">not paid</span>`;
  return `<span class="hash" title="${esc(hash)}">${esc(shortHash(hash))}</span>`;
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
    measured: measuredCount == null ? "—" : `${measuredCount}${c?.unique === true ? " unique" : ""} records`,
    result: result("count", cc !== null),
  });
  rows.push({
    rule: "unique",
    claimed: c?.unique === true ? "all ids unique" : "not claimed",
    measured: r?.count == null ? "—" : `${r.unique_count} unique of ${r.count}`,
    result: result("unique", c?.unique === true),
  });
  rows.push({
    rule: "fields",
    claimed: c?.fields ? c.fields.join(", ") : "not claimed",
    measured: !c?.fields || !judged ? "—" : failed.has("fields") ? "missing in some rows" : "present in every row",
    result: result("fields", Boolean(c?.fields)),
  });
  rows.push({
    rule: "no_nulls",
    claimed: c?.no_nulls === true ? "no nulls" : "not claimed",
    measured: c?.no_nulls !== true || !judged ? "—" : failed.has("no_nulls") ? "null or empty values found" : "none found",
    result: result("no_nulls", c?.no_nulls === true),
  });
  return rows;
}

export function failedTags(failed) {
  if (!failed?.length) return `<span class="faint">—</span>`;
  return `<span class="failed-list">${failed.map((f) => `<span class="rule-tag">${esc(f)}</span>`).join("")}</span>`;
}

export function receiptRow(r, state) {
  const blocked = state?.blocklist?.[r.origin];
  const name = sellerName(r.origin, state?.sellers);
  const cc = claimedCount(r);
  return `<tr>
  <td data-k="Seller"><a class="row-link" href="/app/receipt?id=${encodeURIComponent(r.id)}">${esc(name)}</a><div class="faint hash">${esc(r.origin)}</div></td>
  <td data-k="Status">${statusChip(r.status)}</td>
  <td data-k="Claimed"><span class="num">${cc ?? "—"}</span></td>
  <td data-k="Counted"><span class="num">${r.count ?? "—"}</span>${r.unique_count != null ? `<div class="faint">${esc(r.unique_count)} unique</div>` : ""}</td>
  <td data-k="Failed">${failedTags(r.failed)}</td>
  <td data-k="Tx hash">${txCell(r.tx_hash)}</td>
  <td data-k="Seller record">${recordCell(blocked)}</td>
</tr>`;
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
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}
