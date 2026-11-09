// Console data + behaviour. Two modes, decided at runtime:
//   live       — served by `npm run app` on this machine; /api/state exists and Buy works.
//   published  — static hosting (e.g. Vercel); reads /data/state.json, read-only.
import { esc, statusChip, receiptRow, ruleRows, sellerName, txCell, formatTime, STATUS, failedTags } from "./render.js";
import { icons } from "./icons.js";

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
  return `<div class="notice">${icons.info}<div><strong>Read-only.</strong> Payments need a human passkey in Kite Passport, so buying runs on the operator's machine (<code>npm run app</code>). This page shows the receipts of a published run.${when}</div></div>`;
}

// ---------- console page ----------
export async function mountConsole(root) {
  let state = await loadState();
  const ids = { a: newRequestId(), b: newRequestId() };
  const inFlight = new Set();

  const render = () => {
    const receipts = [...state.receipts].reverse();
    const blocked = Object.keys(state.blocklist ?? {}).length;
    const paid = state.receipts.filter((r) => r.tx_hash).length;
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
        const btnText = inFlight.has(key) ? "Paying…" : block ? `Buy (will be refused)` : `Buy from Seller ${key.toUpperCase()}`;
        return `<article class="seller">
          <div class="seller-top"><span class="seller-name">Seller ${esc(key.toUpperCase())}</span>${block ? `<span class="chip tone-bad">blocked · ${esc(block.reason)}</span>` : url ? `<span class="chip tone-ok">open</span>` : `<span class="chip tone-muted">not deployed</span>`}</div>
          <div class="origin">${esc(origin ?? "no URL in sellers.json yet")}</div>
          ${label ? `<p class="prose">${esc(label)}</p>` : ""}
          <div class="seller-actions">
            <button class="btn ${block ? "btn-ghost" : key === "a" ? "btn-orange" : "btn-blue"} btn-sm" data-buy="${esc(key)}" ${disabled ? "disabled" : ""}>${esc(btnText)}</button>
            <span class="faint" style="font-size:13px">0.001 testnet pieUSD</span>
          </div>
        </article>`;
      })
      .join("");

    root.innerHTML = `
      <div class="app-head">
        <div><span class="label">Console</span><h1>Receipts</h1></div>
        ${modeBadge(state)}
      </div>
      ${modeNotice(state)}
      <div class="stats">
        <div class="stat"><div class="k">kpass calls</div><div class="v" data-testid="kpass-calls">${esc(state.kpass_calls)}</div><div class="s">payments attempted</div></div>
        <div class="stat"><div class="k">Receipts</div><div class="v">${state.receipts.length}</div><div class="s">${paid} with a settlement hash</div></div>
        <div class="stat"><div class="k">Blocked origins</div><div class="v">${blocked}</div><div class="s">refused before kpass</div></div>
        <div class="stat"><div class="k">Disputes</div><div class="v">${state.receipts.filter((r) => r.status === "dispute").length}</div><div class="s">claims that failed</div></div>
      </div>
      ${sellerCards ? `<div class="sellers">${sellerCards}</div>` : ""}
      <div class="table-wrap">
        ${
          receipts.length
            ? `<table class="receipts"><thead><tr><th>Seller</th><th>Status</th><th>Claimed</th><th>Counted</th><th>Failed rules</th><th>Tx hash</th><th>Blocklist</th></tr></thead>
               <tbody>${receipts.map((r) => receiptRow(r, state)).join("")}</tbody></table>`
            : `<div class="empty"><h3>No receipts yet</h3><p>${live ? "Buy from Seller A, then Seller A again, then Seller B." : "No run has been published yet. Hashes appear here only after kpass returns them."}</p></div>`
        }
      </div>`;

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
      toast(`${statusChip(r.status)} <strong style="margin-left:8px">Seller ${esc(key.toUpperCase())}</strong> — ${esc(s?.note ?? r.status)} ${r.replayed ? "(replayed, no new payment)" : ""}`);
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
    <div class="detail-grid">
      <div class="card">
        <h2>Label vs delivery</h2>
        <table class="rules">
          <thead><tr><th>Rule</th><th>Seller claimed</th><th>Code measured</th><th>Result</th></tr></thead>
          <tbody>${rows
            .map(
              (x) => `<tr><td><code>${esc(x.rule)}</code></td><td>${esc(x.claimed)}</td><td>${esc(x.measured)}</td>
              <td class="res ${x.result === "pass" ? "res-pass" : x.result === "fail" ? "res-fail" : "res-none"}">${x.result === "pass" ? "pass" : x.result === "fail" ? "fail" : "not checked"}</td></tr>`,
            )
            .join("")}</tbody>
        </table>
        <p class="faint" style="font-size:14px;margin:18px 0 0">Claims were extracted by SERV from the seller's prose. Every measurement and every result was computed by Tare's code.</p>
        ${r.error ? `<div class="notice" style="margin:20px 0 0">${icons.info}<div><strong>Error:</strong> ${esc(r.error)}</div></div>` : ""}
        ${r.reason ? `<div class="notice" style="margin:20px 0 0">${icons.info}<div><strong>Reason:</strong> ${esc(r.reason)}</div></div>` : ""}
      </div>
      <div class="card">
        <h2>Evidence</h2>
        <dl class="facts">
          <div><dt>Settlement tx hash</dt><dd>${r.tx_hash ? `<span class="hash">${esc(r.tx_hash)}</span>${copyBtn(r.tx_hash)}` : txCell(null)}</dd></div>
          <div><dt>Body sha256</dt><dd><span class="hash">${esc(r.body_sha256 ?? "—")}</span>${copyBtn(r.body_sha256)}</dd></div>
          <div><dt>Prompt sha256</dt><dd><span class="hash">${esc(r.prompt_sha256 ?? "—")}</span></dd></div>
          <div><dt>Failed rules</dt><dd>${failedTags(r.failed)}</dd></div>
          <div><dt>Origin</dt><dd><span class="hash">${esc(r.origin)}</span> · ${blocked ? `<span class="tone-bad">blocked (${esc(blocked.reason)})</span>` : `<span class="faint">not blocked</span>`}</dd></div>
          <div><dt>URL</dt><dd><span class="hash">${esc(r.url)}</span></dd></div>
          <div><dt>Request id</dt><dd><span class="hash">${esc(r.request_id ?? "—")}</span></dd></div>
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
  const entries = Object.entries(state.sellers ?? {});
  const rows = entries
    .map(([key, url]) => {
      let origin = null;
      try {
        origin = url ? new URL(url).origin : null;
      } catch {}
      const mine = state.receipts.filter((r) => r.origin === origin);
      const last = mine[mine.length - 1];
      const block = origin ? state.blocklist?.[origin] : null;
      return `<article class="seller">
        <div class="seller-top"><span class="seller-name">Seller ${esc(key.toUpperCase())}</span>${block ? `<span class="chip tone-bad">blocked · ${esc(block.reason)}</span>` : url ? `<span class="chip tone-ok">open</span>` : `<span class="chip tone-muted">not deployed</span>`}</div>
        ${state.seller_labels?.[key] ? `<p class="prose">${esc(state.seller_labels[key])}</p>` : ""}
        <dl class="facts">
          <div><dt>Origin (blocklist key)</dt><dd><span class="hash">${esc(origin ?? "—")}</span></dd></div>
          <div><dt>Buyer URL</dt><dd><span class="hash">${esc(url ?? "not set in sellers.json")}</span></dd></div>
          <div><dt>Price</dt><dd>0.001 pieUSD per call · Kite testnet</dd></div>
          <div><dt>Receipts</dt><dd>${mine.length}${last ? ` · last ${statusChip(last.status)}` : ""}</dd></div>
        </dl>
      </article>`;
    })
    .join("");

  root.innerHTML = `
    <div class="app-head"><div><span class="label">Sellers</span><h1>Who we buy from</h1></div>${modeBadge(state)}</div>
    ${modeNotice(state)}
    <p class="lede" style="margin:0 0 28px">Each seller is the unchanged Kite x402 Express template on its own origin. The origin is the blocklist key, so two sellers never share one.</p>
    ${rows ? `<div class="sellers">${rows}</div>` : `<div class="card empty"><h3>No sellers configured</h3><p>Deploy them (sellers/README.md) and fill sellers.json.</p></div>`}`;
}
