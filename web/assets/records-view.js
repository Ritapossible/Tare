// "Check a seller": pure lookup + rendering over a published records feed (no DOM). Everything from
// a feed is escaped: a feed is data published by someone else.
import { esc, statusChip, failedTags, txCell, formatTime } from "./render.js";

// Accepts a seller URL or bare host. Returns { origin } or { error }.
export function normalizeSeller(input) {
  let s = String(input ?? "").trim();
  if (!s) return { error: "Paste a seller URL, for example https://seller.example/v1/data.json" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Only http(s) sellers can be checked." };
    return { origin: u.origin };
  } catch {
    return { error: "That does not look like a URL." };
  }
}

export function lookupRecord(feed, input) {
  const n = normalizeSeller(input);
  if (n.error) return n;
  const record = (feed?.records ?? []).find((r) => r.origin === n.origin) ?? null;
  return { origin: n.origin, record };
}

export function badgeUrl(siteOrigin, record) {
  const host = new URL(record.origin).host.toLowerCase().replace(":", "_");
  return `${siteOrigin}/badges/${host}.svg`;
}

export function badgeSnippet(siteOrigin, record) {
  const check = `${siteOrigin}/check?url=${encodeURIComponent(record.origin)}`;
  return `<a href="${check}"><img src="${badgeUrl(siteOrigin, record)}" alt="Verified by Tare"></a>`;
}

function evidenceHTML(e) {
  if (!e) return `<p class="dim">No receipt evidence published.</p>`;
  const quote = (e.explanation ? `<p class="explain explain-inline">${esc(e.explanation)}<span class="faint"> (SERV Reasoning, from the measured evidence)</span></p>` : "") +
    (e.promise ? `<blockquote class="promise-inline">${esc(e.promise)}</blockquote>` : "");
  const promised = e.promised?.claimed_count ?? "-";
  const uniq = e.promised?.unique === true;
  const delivered = e.delivered ? (uniq ? e.delivered.unique_count : e.delivered.count) : "-";
  return `${quote}<div class="lc-nums"><span class="big">${esc(promised)}</span><span class="arrow" aria-hidden="true">→</span><span class="big ${e.failed?.length ? "tone-bad" : ""}">${esc(delivered)}</span></div>
    <p class="sub"><span>promised → delivered${uniq ? " (unique)" : ""}</span>${statusChip(e.status)}</p>
    ${e.failed?.length ? `<div class="rcard-failed">${failedTags(e.failed)}</div>` : ""}
    <dl class="facts">
      <div><dt>Settlement tx hash</dt><dd>${txCell(e.tx_hash, e.status)}</dd></div>
      <div><dt>Body sha256</dt><dd><span class="hash">${esc(e.body_sha256 ?? "-")}</span></dd></div>
      <div><dt>Kite identity</dt><dd>${e.seller_identity?.did ? `<span class="hash">${esc(e.seller_identity.did)}</span>` : `<span class="faint">none on record</span>`}</dd></div>
      <div><dt>Checked</dt><dd>${esc(formatTime(e.checked_at))}</dd></div>
    </dl>`;
}

// result = lookupRecord(...); siteOrigin = where badges are served (e.g. https://tare-agent.vercel.app)
export function checkResultHTML(result, { siteOrigin, publisher = "tare" } = {}) {
  if (result.error) return `<div class="notice"><div>${esc(result.error)}</div></div>`;
  const r = result.record;
  if (!r) {
    return `<article class="card check-result">
      <div class="seller-top"><span class="seller-name hash">${esc(result.origin)}</span><span class="chip tone-muted">never checked</span></div>
      <p class="dim">No record from ${esc(publisher)}. That is not a recommendation either way: Tare has simply never bought from this seller.</p>
    </article>`;
  }
  const held = r.status === "held";
  const verified = !held && (r.counts?.verified ?? 0) > 0 && r.evidence?.status === "clean";
  return `<article class="card check-result">
    <div class="seller-top"><span class="seller-name hash">${esc(r.origin)}</span>${
      held ? `<span class="chip tone-bad">held · ${esc(r.reason)}</span>` : `<span class="chip tone-ok">in good standing</span>`
    }</div>
    <div class="record-banner ${held ? "bad" : "ok"}"><strong>${held ? `Held since ${esc(formatTime(r.since))}` : "In good standing"}</strong><span>${
      held ? "A check failed against this seller's own promise. Agents trusting this feed stop before paying." : "Every recorded check matched what the seller promised."
    }</span></div>
    <div class="track">
      <div class="t ${r.counts?.verified ? "t-ok" : "t-zero"}"><span class="n">${esc(r.counts?.verified ?? 0)}</span><span class="l">Verified</span></div>
      <div class="t ${r.counts?.disputes ? "t-bad" : "t-zero"}"><span class="n">${esc(r.counts?.disputes ?? 0)}</span><span class="l">Disputes</span></div>
      <div class="t ${r.counts?.stopped ? "t-muted" : "t-zero"}"><span class="n">${esc(r.counts?.stopped ?? 0)}</span><span class="l">Stopped</span></div>
    </div>
    <div class="last-check">${evidenceHTML(r.evidence)}</div>
    ${
      verified && siteOrigin
        ? `<div class="badge-box"><span class="k">Badge for this seller</span><img src="${esc(badgeUrl(siteOrigin, r))}" alt="Verified by Tare" height="24"><code>${esc(badgeSnippet(siteOrigin, r))}</code></div>`
        : ""
    }
  </article>`;
}

export function recordListHTML(feed) {
  const rows = (feed?.records ?? [])
    .map(
      (r) => `<a class="rec-row" href="?url=${encodeURIComponent(r.origin)}"><span class="hash">${esc(new URL(r.origin).host)}</span>${
        r.status === "held" ? `<span class="chip tone-bad">held · ${esc(r.reason)}</span>` : `<span class="chip tone-ok">in good standing</span>`
      }</a>`,
    )
    .join("");
  return rows || `<p class="dim">No seller records published yet.</p>`;
}

// Who signed this feed. The browser shows it; agents verify it (TARE_FEEDS=url#signer).
export function feedSignerHTML(feed) {
  const sig = feed?.signature;
  if (!sig?.signer) return "This feed is not signed.";
  const who = sig.did ? `<span class="hash">${esc(sig.did)}</span> (key <span class="hash">${esc(sig.signer)}</span>)` : `<span class="hash">${esc(sig.signer)}</span>`;
  const pin = sig.did ?? sig.signer;
  return `Signed by ${who}. An agent can refuse anything else: <code class="hash">TARE_FEEDS=${esc(globalThis.location?.origin ?? "")}/records.json#${esc(pin)}</code>`;
}

