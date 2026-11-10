// Console data + behaviour. Two modes, decided at runtime:
//   live       - served by `npm run app` on this machine; /api/state exists and Buy works.
//   published  - static hosting (e.g. Vercel); reads /data/state.json, read-only.
import { esc, statusChip, receiptRow, ruleRows, sellerName, txCell, formatTime, STATUS, failedTags, recordChip, recordCell, receiptCard, PREVIEW_RECEIPTS, sellerSummary, sellerProfileCard, isTxHash, settlementCell, advertisedRows, promiseHTML } from "./render.js";
import { icons } from "./icons.js";
import { sprinkle } from "./layout.js";

const EMPTY = { mode: "published", generated_at: null, sellers: {}, seller_labels: {}, receipts: [], blocklist: {}, kpass_calls: 0, prompt_sha256: null, model: "gpt-5.4-mini-serv-multipath" };

export async function loadState() {
  try {
    const r = await fetch("/api/state", { headers: { accept: "application/json" }, cache: "no-store" });
    if (r.ok && (r.headers.get("content-type") ?? "").includes("application/json")) return { ...EMPTY, ...(await r.json()) };
  } catch {
    /* not running locally */
  }
  try {
    const r = await fetch("/data/state.json", { cache: "no-store" });
    if (r.ok) return { ...EMPTY, ...(await r.json()), mode: "published" };
  } catch {
    /* no published run */
  }
  return { ...EMPTY };
}

function toast(html) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.innerHTML = html;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 6000);
}

function newRequestId() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
}

export function modeBadge(state) {
  const live = state.mode === "live";
  return `<span class="mode ${live ? "live" : "published"}"><span class="dot"></span>${live ? "Live on this machine" : "Published run · read-only"}</span>`;
}

export function modeNotice(state) {
  if (state.mode === "live") return "";
  const when = state.generated_at ? ` Published ${esc(formatTime(state.generated_at))}.` : "";
  return `<div class="notice">${icons.info}<div><strong>Read-only.</strong> Payments are signed on the operator's machine (<code>npm run app</code>), so buying runs there. This page shows the receipts of a published run; every hash is a real Kite testnet settlement.${when}</div></div>`;
}

export function railLabel(rail) {
  if (rail === "x402-direct") return "x402 on Kite testnet (Pieverse)";
  if (rail === "kpass") return "via Kite Passport";
  return "payments attempted";  // no rail recorded
}

// ---------- console page ----------
export async function mountConsole(root) {
  let state = await loadState();
  const ids = { a: newRequestId(), b: newRequestId() };
  const inFlight = new Set();

  const render = () => {
    const receipts = [...state.receipts].reverse();
    const blocked = Object.keys(state.blocklist ?? {}).length;
    const paid = state.receipts.filter((r) => isTxHash(r.tx_hash)).length;
    const live = state.mode === "live";

    const sellerCards = Object.entries(state.sellers ?? {})
      .map(([key, url]) => {
        let origin = null;
        try {
          origin = url ? new URL(url).origin : null;
        } catch {}
        const block = origin ? state.blocklist?.[origin] : null;
        const label = state.seller_labels?.[key];
        const disabled = !live || !url || inFlight.has(key);
        const btnText = inFlight.has(key) ? "Paying…" : block ? `Buy again (seller held)` : `Buy from Seller ${key.toUpperCase()}`;
        return `<article class="seller seller-${esc(key)}">
          <div class="seller-top"><span class="seller-name">Seller ${esc(key.toUpperCase())}</span>${recordChip(block, Boolean(url))}</div>
          <div class="origin">${esc(origin ?? "no URL in sellers.json yet")}</div>
          ${label ? `<p class="prose">${esc(label)}</p>` : ""}
          ${
            live
              ? `<div class="seller-actions">
            <button class="btn ${block ? "btn-ghost" : key === "a" ? "btn-orange" : "btn-blue"}" data-buy="${esc(key)}" ${disabled ? "disabled" : ""}>${esc(btnText)}</button>
            <span class="faint price">0.001 testnet pieUSD per call</span>
          </div>`
              : `<p class="local-note">${icons.lock}Buying runs on the operator's machine · 0.001 testnet pieUSD per call</p>`
          }
        </article>`;
      })
      .join("");

    const disputes = state.receipts.filter((r) => r.status === "dispute").length;
    const previewState = { sellers: { a: "https://seller-a/x", b: "https://seller-b/x" }, blocklist: {} };
    const preview = PREVIEW_RECEIPTS.map((r) => ({ ...r, origin: r.origin === "seller-a" ? "https://seller-a" : "https://seller-b" }));

    root.innerHTML = `
      <div class="app-hero pixels">
        <div class="app-hero-text">
          <span class="label">Console</span>
          <h1 class="display">Receipts, <span class="stamp stamp-blue">checked.</span></h1>
          <p>Promised vs delivered, for every seller Tare paid.</p>
        </div>
        ${modeBadge(state)}
      </div>
      ${modeNotice(state)}
      <div class="stats">
        <div class="stat stat-kpass"><div class="k">Payment calls</div><div class="v" data-testid="kpass-calls">${esc(state.kpass_calls)}</div><div class="s">${esc(railLabel(state.payment_rail))}</div></div>
        <div class="stat stat-receipts"><div class="k">Receipts</div><div class="v">${state.receipts.length}</div><div class="s">${paid} with a settlement hash</div></div>
        <div class="stat stat-held"><div class="k">Held sellers</div><div class="v ${blocked ? "tone-bad" : ""}">${blocked}</div><div class="s">stopped before payment</div></div>
        <div class="stat stat-disputes"><div class="k">Disputes</div><div class="v ${disputes ? "tone-bad" : ""}">${disputes}</div><div class="s">promises that failed</div></div>
      </div>
      ${sellerCards ? `<span class="label">Sellers</span><div class="sellers">${sellerCards}</div>` : ""}
      <span class="label">Receipts</span>
      ${
        receipts.length
          ? `<div class="rcards">${receipts.map((r) => receiptCard(r, state)).join("")}</div>
             <div class="table-wrap desktop-only"><table class="receipts"><thead><tr><th>Seller</th><th>Status</th><th>Promised</th><th>Delivered</th><th>Failed checks</th><th>Tx hash</th><th>Seller record</th></tr></thead>
             <tbody>${receipts.map((r) => receiptRow(r, state)).join("")}</tbody></table></div>`
          : live
            ? `<div class="empty card"><h3>No receipts yet</h3><p>Buy from Seller A, then Seller A again, then Seller B.</p></div>`
            : `<div class="preview-head"><h3>What a run looks like</h3><p>No run has been published yet. This preview uses the real seller payloads; hashes appear only after a real payment returns them.</p></div>
               <div class="rcards always">${preview.map((r) => receiptCard(r, previewState, { preview: true })).join("")}</div>`
      }`;

    sprinkle(root.querySelector(".app-hero"), 12, { side: "right" });
    root.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => buy(b.dataset.buy)));
  };

  async function buy(key) {
    if (inFlight.has(key)) return;
    inFlight.add(key);
    render();
    try {
      const res = await fetch("/api/buy", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tare-request": "1" },
        body: JSON.stringify({ seller: key, request_id: ids[key] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const r = body.receipt;
      const s = STATUS[r.status];
      toast(`${statusChip(r.status)} <strong style="margin-left:8px">Seller ${esc(key.toUpperCase())}</strong> - ${esc(s?.note ?? r.status)} ${r.replayed ? "(replayed, no new payment)" : ""}`);
      ids[key] = newRequestId(); // next click is a new purchase
    } catch (err) {
      toast(`<strong>Buy failed:</strong> ${esc(err.message)}`);
    } finally {
      inFlight.delete(key);
      state = await loadState();
      render();
    }
  }

  render();
}

// ---------- receipt page ----------
export async function mountReceipt(root) {
  const state = await loadState();
  const id = new URLSearchParams(location.search).get("id");
  const r = state.receipts.find((x) => x.id === id);
  const back = `<a class="back" href="/app">${icons.back} All receipts</a>`;
  if (!r) {
    root.innerHTML = `${back}<div class="card empty"><h3>Receipt not found</h3><p>It may belong to a run that is not published here.</p></div>`;
    return;
  }
  const s = STATUS[r.status] ?? { note: "" };
  const name = sellerName(r.origin, state.sellers);
  const rows = ruleRows(r);
  const blocked = state.blocklist?.[r.origin];
  const copyBtn = (v) => (v ? `<button class="copy" data-copy="${esc(v)}">copy</button>` : "");

  root.innerHTML = `
    ${back}
    <div class="verdict-hero"><h1 class="display">${esc(name)}</h1>${statusChip(r.status)}</div>
    <p class="lede" style="margin:-8px 0 32px">${esc(s.note)}</p>
    <div class="card promise-card"><h2>The promise, word for word</h2>${promiseHTML(r)}</div>
    <div class="detail-grid">
      <div class="card">
        <h2>Promise vs delivery</h2>
        <table class="rules">
          <thead><tr><th>Check</th><th>Seller promised</th><th>Code measured</th><th>Result</th></tr></thead>
          <tbody>${rows
            .map(
              (x) => `<tr><td><code>${esc(x.rule)}</code></td><td>${esc(x.claimed)}</td><td>${esc(x.measured)}</td>
              <td class="res ${x.result === "pass" ? "res-pass" : x.result === "fail" ? "res-fail" : "res-none"}">${x.result === "pass" ? "pass" : x.result === "fail" ? "fail" : "not checked"}</td></tr>`,
            )
            .join("")}</tbody>
        </table>
        ${
          advertisedRows(r).length
            ? `<h2 style="margin-top:26px">402 advertisement vs delivery</h2>
        <table class="rules"><thead><tr><th>Check</th><th>Advertised</th><th>Result</th></tr></thead><tbody>${advertisedRows(r)
          .map((x) => `<tr><td><code>${esc(x.rule)}</code></td><td>${esc(x.claimed)}</td><td class="res ${x.result === "pass" ? "res-pass" : "res-fail"}">${x.result}</td></tr>`)
          .join("")}</tbody></table>`
            : ""
        }
        <p class="faint" style="font-size:14px;margin:18px 0 0">Claims were extracted by SERV from the seller's prose. Every measurement and every result was computed by Tare's code.</p>
        ${r.error ? `<div class="notice" style="margin:20px 0 0">${icons.info}<div><strong>Error:</strong> ${esc(r.error)}</div></div>` : ""}
        ${r.reason ? `<div class="notice" style="margin:20px 0 0">${icons.info}<div><strong>Reason:</strong> ${esc(r.reason)}</div></div>` : ""}
      </div>
      <div class="card">
        <h2>Evidence</h2>
        <dl class="facts">
          <div><dt>Settlement tx hash</dt><dd>${settlementCell(r)}</dd></div>
          <div><dt>Body sha256</dt><dd><span class="hash">${esc(r.body_sha256 ?? "-")}</span>${copyBtn(r.body_sha256)}</dd></div>
          <div><dt>Prompt sha256</dt><dd><span class="hash">${esc(r.prompt_sha256 ?? "-")}</span></dd></div>
          <div><dt>Failed checks</dt><dd>${failedTags(r.failed)}</dd></div>
          <div><dt>Seller record</dt><dd><span class="hash">${esc(r.origin)}</span> · ${recordCell(blocked)}</dd></div>
          <div><dt>URL</dt><dd><span class="hash">${esc(r.url)}</span></dd></div>
          <div><dt>Request id</dt><dd><span class="hash">${esc(r.request_id ?? "-")}</span></dd></div>
          <div><dt>Time</dt><dd>${esc(formatTime(r.created_at))}</dd></div>
        </dl>
      </div>
    </div>`;

  root.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        b.textContent = "copied";
      } catch {
        b.textContent = "copy failed";
      }
    }),
  );
}

// ---------- sellers page ----------
export async function mountSellers(root) {
  const state = await loadState();
  const keys = Object.keys(state.sellers ?? {});
  const cards = keys.map((k) => sellerProfileCard(sellerSummary(state, k), icons)).join("");

  root.innerHTML = `
    <div class="app-hero pixels">
      <div class="app-hero-text">
        <span class="label">Sellers</span>
        <h1 class="display">Sellers, <span class="stamp stamp-orange">on record.</span></h1>
        <p>Every seller Tare buys from, and how its promises held up.</p>
      </div>
      ${modeBadge(state)}
    </div>
    ${modeNotice(state)}
    ${cards ? `<div class="sellers">${cards}</div>` : `<div class="card empty"><h3>No sellers configured</h3><p>Deploy them (sellers/README.md) and fill sellers.json.</p></div>`}
    <span class="label">How sellers are set up</span>
    <div class="setup">
      <div class="setup-item"><span class="ico">${icons.layers}</span><div><strong>Unchanged Kite x402 template</strong><p>Each seller is the Kite Express wrapper with only environment settings.</p></div></div>
      <div class="setup-item"><span class="ico">${icons.lock}</span><div><strong>One origin each</strong><p>The origin is the key of the seller record, so holding one seller never holds another.</p></div></div>
      <div class="setup-item"><span class="ico">${icons.coin}</span><div><strong>0.001 pieUSD per call</strong><p>Kite testnet only. The probe checks the price and network before any payment.</p></div></div>
    </div>`;

  sprinkle(root.querySelector(".app-hero"), 12, { side: "right" });
}
