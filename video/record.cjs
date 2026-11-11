// Records the demo scenes as high-quality frames (Chrome's screencast) with timing markers.
//
//   node video/record.cjs <buildDir> <scene ids…|all>
//
// Needs the local console running (npm run app, TARE_PAYMENT_RAIL as for a live run) for the console
// scenes; the buys are REAL testnet payments. The "warn" scene runs a real fresh agent and shows its
// real output. Choreography (cursor, scroll, zoom) is paced by build/timing.json, so what is on
// screen matches the line being spoken.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BUILD = path.resolve(process.argv[2] || path.join(__dirname, "build"));
const WANT = process.argv.slice(3);
const W = 1920, H = 1080;
const CONSOLE = process.env.TARE_CONSOLE || "http://127.0.0.1:4046";
const SITE = process.env.TARE_SITE || "https://tare-agent.vercel.app";
const timing = JSON.parse(fs.readFileSync(path.join(BUILD, "timing.json"), "utf8"));
const sceneOf = (id) => timing.scenes.find((s) => s.id === id);
const lineMs = (id, i) => { const l = sceneOf(id).lines[i]; return Math.round((l.seconds + l.gap) * 1000); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- in-page helpers: a visible cursor, smooth zoom and scroll ----------
const HELPERS = `
(() => {
  if (window.__tare) return;
  const css = document.createElement('style');
  css.textContent = \`
    #__cursor { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 26px; height: 26px; pointer-events: none;
      transform: translate(960px, 1200px); transition: transform 0.9s cubic-bezier(.3,.7,.2,1); }
    #__cursor svg { width: 26px; height: 26px; filter: drop-shadow(0 2px 6px rgba(0,0,0,.6)); }
    #__cursor.press svg { transform: scale(.82); transition: transform .12s; }
    #__ring { position: fixed; z-index: 2147483646; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%;
      border: 3px solid #f97316; opacity: 0; pointer-events: none; }
    #__ring.go { animation: __ring .6s ease-out; }
    @keyframes __ring { from { opacity: .9; transform: scale(.3); } to { opacity: 0; transform: scale(1.4); } }
    body.__zoomable { transition: transform 1.1s cubic-bezier(.45,.05,.2,1); transform-origin: 0 0; }
    header[data-nav] { transition: opacity .5s ease; }
    body.__zoomed header[data-nav] { opacity: 0; }
    html { scroll-behavior: auto; }
  \`;
  const c = document.createElement('div'); c.id = '__cursor';
  c.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const ring = document.createElement('div'); ring.id = '__ring';
  // The init script runs before the document exists: attach the visuals once it does.
  const add = () => { document.documentElement.appendChild(css); document.documentElement.appendChild(c); document.documentElement.appendChild(ring); };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
  let zoom = { s: 1, tx: 0, ty: 0 };
  window.__tare = {
    cursorTo(x, y) { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; },
    press(x, y) { c.classList.add('press'); ring.style.left = x + 'px'; ring.style.top = y + 'px'; ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go'); setTimeout(() => c.classList.remove('press'), 160); },
    zoomTo(sel, s, opts = {}) {
      const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      document.body.classList.add('__zoomable');
      if (!el || s === 1) { zoom = { s: 1, tx: 0, ty: 0 }; document.body.style.transform = ''; document.body.classList.remove('__zoomed'); return; }
      document.body.classList.add('__zoomed'); // the floating nav would sit over the zoomed content
      // measure without the current transform
      const prev = document.body.style.transform; document.body.style.transition = 'none'; document.body.style.transform = '';
      const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2 + scrollX + (opts.dx || 0); const cy = r.top + r.height / 2 + scrollY + (opts.dy || 0);
      document.body.style.transform = prev; void document.body.offsetWidth; document.body.style.transition = '';
      const tx = innerWidth / 2 - s * cx; const ty = innerHeight / 2 + scrollY - s * cy - (s - 1) * 0;
      zoom = { s, tx, ty };
      document.body.style.transform = 'translate(' + tx + 'px,' + (ty - scrollY * (1 - 1)) + 'px) scale(' + s + ')';
    },
    scrollToEl(sel, offset = 120, ms = 1100) {
      const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) return;
      const target = el.getBoundingClientRect().top + scrollY - offset; const start = scrollY; const t0 = performance.now();
      const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const step = (now) => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, start + (target - start) * ease(t)); if (t < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    },
  };
})();`;

// ---------- recorder ----------
class Recorder {
  constructor(page, dir) { this.page = page; this.dir = dir; this.frames = []; this.markers = []; }
  async start() {
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    let n = 0;
    this.cdp.on("Page.screencastFrame", async (f) => {
      const file = path.join(this.dir, `f${String(n++).padStart(6, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, "base64"));
      this.frames.push({ file, t: f.metadata.timestamp });
      try { await this.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {}
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    this.t0 = Date.now() / 1000;
    this.mark("start");
  }
  mark(name) { this.markers.push({ name, t: Date.now() / 1000 }); }
  async stop() {
    this.mark("end");
    await sleep(300);
    await this.cdp.send("Page.stopScreencast");
    fs.writeFileSync(path.join(this.dir, "frames.json"), JSON.stringify({ frames: this.frames, markers: this.markers }, null, 1));
    console.log(`  ${path.basename(this.dir)}: ${this.frames.length} frames, ${(this.markers.at(-1).t - this.markers[0].t).toFixed(1)} s`);
  }
}

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "dark" });
  await ctx.addInitScript(HELPERS);
  return ctx.newPage();
}

async function cursorTo(page, locator, { press = false } = {}) {
  const box = await locator.boundingBox();
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
  await page.evaluate(([x, y]) => window.__tare.cursorTo(x, y), [x, y]);
  await sleep(950);
  if (press) { await page.evaluate(([x, y]) => window.__tare.press(x, y), [x, y]); await sleep(150); }
  return { x, y };
}
const zoom = (page, sel, s, opts) => page.evaluate(([sel, s, opts]) => window.__tare.zoomTo(sel, s, opts), [sel, s, opts || {}]);
const scrollTo = (page, sel, offset) => page.evaluate(([sel, o]) => window.__tare.scrollToEl(sel, o), [sel, offset ?? 120]);

// ---------- scenes ----------
async function slide(browser, id) {
  const page = await newPage(browser);
  await page.goto(`file://${path.join(__dirname, "slides.html")}?s=${id}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // restart animations at the moment recording begins
  await page.evaluate(() => { document.querySelectorAll(".in").forEach((e) => { e.style.animation = "none"; void e.offsetWidth; e.style.animation = ""; }); });
  const rec = new Recorder(page, path.join(BUILD, "rec", id));
  await rec.start();
  await sleep(sceneOf(id).speech * 1000 + 900);
  await rec.stop();
  await page.context().close();
}

async function buyAndWait(page, rec, key) {
  const btn = page.locator(`[data-buy="${key}"]`);
  await cursorTo(page, btn, { press: true });
  const resp = page.waitForResponse((r) => r.url().endsWith("/api/buy"), { timeout: 300000 });
  await btn.click();
  rec.mark("wait-start");
  const body = await (await resp).json();
  rec.mark("wait-end");
  await sleep(900); // toast + re-render
  return body.receipt;
}

async function consoleScenes(browser, wanted) {
  const page = await newPage(browser);
  await page.goto(`${CONSOLE}/app`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const result = {};
  const run = async (id, fn) => {
    if (!wanted(id)) return;
    const rec = new Recorder(page, path.join(BUILD, "rec", id));
    await rec.start();
    await fn(rec);
    await rec.stop();
  };

  await run("console", async () => {
    await page.evaluate(() => window.__tare.cursorTo(1300, 700));
    await sleep(600);
    await zoom(page, ".stats", 1.35);
    await sleep(Math.max(1500, lineMs("console", 0) - 600));
    await zoom(page, null, 1);
    await sleep(900);
  });

  await run("buy-a", async (rec) => {
    await scrollTo(page, ".sellers", 260); await sleep(900);
    result.a = await buyAndWait(page, rec, "a");
    // show the new receipt row
    await page.evaluate(() => window.__tare.cursorTo(1700, 1000));
    await scrollTo(page, "table.receipts", 90); await sleep(1200);
    const row = "table.receipts tbody tr:first-child";
    await zoom(page, row, 1.55, { dx: -260 });          // promised vs delivered
    await sleep(lineMs("buy-a", 0) + lineMs("buy-a", 1) - 1200);
    await zoom(page, row, 1.55, { dx: 140 });            // failed checks incl. advertised:fields
    await sleep(lineMs("buy-a", 2));
    await zoom(page, row, 1.55, { dx: 420 });            // tx hash + seller record
    await sleep(lineMs("buy-a", 3));
    await zoom(page, null, 1); await sleep(900);
  });

  await run("buy-a-again", async (rec) => {
    await scrollTo(page, ".stats", 140); await sleep(1100);
    result.a2 = await buyAndWait(page, rec, "a");
    await zoom(page, ".stats", 1.4);
    await sleep(Math.max(1800, lineMs("buy-a-again", 0) - 2600));
    await zoom(page, null, 1); await sleep(900);
  });

  await run("buy-b", async (rec) => {
    result.b = await buyAndWait(page, rec, "b");
    await scrollTo(page, "table.receipts", 90); await sleep(1200);
    await zoom(page, "table.receipts tbody tr:first-child", 1.45, { dx: -120 });
    await sleep(Math.max(1800, lineMs("buy-b", 0) - 1800));
    await zoom(page, null, 1); await sleep(800);
  });

  await run("receipt", async (rec) => {
    const st = await (await page.request.get(`${CONSOLE}/api/state`)).json();
    const id = st.receipts.find((r) => r.status === "dispute").id;
    const link = page.locator(`a[href*="${id}"]:visible`).first();
    await link.scrollIntoViewIfNeeded();
    await cursorTo(page, link, { press: true });
    await link.click();
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await sleep(700);
    rec.mark("speak"); // narration starts once the receipt is on screen
    const promise = page.locator("text=The promise, word for word").first();
    await page.evaluate(() => window.__tare.cursorTo(1750, 950));
    await scrollTo(page, ".promise-card, .card:has(.promise-quote), main .card:nth-of-type(2)", 120);
    const card = await page.evaluateHandle(() => [...document.querySelectorAll(".card")].find((c) => /word for word/i.test(c.textContent)));
    if (card) await page.evaluate((c) => window.__tare.scrollToEl(c, 140), card);
    await sleep(1200);
    rec.mark("line-1");
    if (card) await page.evaluate((c) => window.__tare.zoomTo(c, 1.35), card);
    await sleep(lineMs("receipt", 0));
    await zoom(page, null, 1); await sleep(600);
    const ev = await page.evaluateHandle(() => [...document.querySelectorAll(".card")].find((c) => /Evidence/.test(c.querySelector("h2")?.textContent || "")));
    if (ev) await page.evaluate((c) => window.__tare.scrollToEl(c, 140), ev);
    await sleep(1200);
    rec.mark("line-2");
    if (ev) await page.evaluate((c) => window.__tare.zoomTo(c, 1.3), ev);
    await sleep(Math.max(2000, lineMs("receipt", 1) - 1800));
    await zoom(page, null, 1); await sleep(700);
  });
  await page.context().close();
  return result;
}

function terminalHTML(lines) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap">
<style>html,body{margin:0;width:1920px;height:1080px;background:#050505;font-family:'JetBrains Mono',monospace}
.win{position:absolute;inset:110px 150px;background:#0c0c0c;border:1px solid #2a2a2a;border-radius:22px;box-shadow:0 40px 120px rgba(0,0,0,.6);overflow:hidden}
.bar{height:58px;border-bottom:1px solid #222;display:flex;align-items:center;gap:12px;padding:0 24px;color:#777;font-size:20px}
.bar i{width:15px;height:15px;border-radius:50%;background:#333;display:inline-block}
pre{margin:0;padding:34px 40px;color:#e5e5e5;font-size:27px;line-height:1.65;white-space:pre-wrap;word-break:break-all}
.p{color:#f97316}.c{color:#6b6b6b}.ok{color:#22c55e}.bad{color:#ef4444}.k{color:#1d9bf0}
.cur{display:inline-block;width:14px;height:30px;background:#f97316;vertical-align:-5px;animation:b 1s steps(1) infinite}@keyframes b{50%{opacity:0}}</style>
<div class="win"><div class="bar"><i></i><i></i><i></i><span style="margin-left:16px">another agent · trusts Tare's signed records</span></div><pre id="t"></pre></div>
<script>const L=${JSON.stringify(lines.map((l) => ({ ...l, text: esc(l.text) })))};const t=document.getElementById('t');
window.play=async(perChar)=>{for(const l of L){if(l.type==='cmd'){const s=document.createElement('span');t.appendChild(s);s.innerHTML='<span class="p">$ </span>';for(const ch of l.text){s.innerHTML+=ch;await new Promise(r=>setTimeout(r,perChar));}t.appendChild(document.createTextNode('\\n'));await new Promise(r=>setTimeout(r,500));}else{const s=document.createElement('span');s.className=l.cls||'';s.innerHTML=l.text+'\\n';t.appendChild(s);await new Promise(r=>setTimeout(r,l.pause||250));}}const c=document.createElement('span');c.className='cur';t.appendChild(c);};</script>`;
}

async function warnScene(browser) {
  // Real run: a fresh agent (empty store) that trusts the live, signed feed tries seller A.
  const sellers = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "sellers.json"), "utf8"));
  const publisher = execFileSync("node", ["-e", "const {privateKeyToAccount}=require('viem/accounts');process.stdout.write(privateKeyToAccount(require('fs').readFileSync('data/publisher.key','utf8').trim()).address)"], { cwd: path.join(__dirname, "..") }).toString();
  const feed = `${SITE}/records.json#${publisher}`;
  // A brand-new agent: an empty working folder (so an empty store), trusting only the signed feed.
  // The command is the real CLI; its output is shown exactly as printed. A refused buy never reaches
  // the payment rail, so no wallet is needed here (the kpass rail is named but never called).
  const agentDir = path.join(BUILD, "fresh-agent");
  fs.rmSync(agentDir, { recursive: true, force: true });
  fs.mkdirSync(agentDir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, "..", "sellers.json"), path.join(agentDir, "sellers.json"));
  const printed = execFileSync("node", [path.join(__dirname, "..", "scripts", "buy.mjs"), "a"], {
    cwd: agentDir, env: { ...process.env, TARE_FEEDS: feed, TARE_PAYMENT_RAIL: "kpass", NODE_NO_WARNINGS: "1" },
  }).toString().trim().split("\n").filter((l) => !/EnvHttpProxyAgent|trace-warnings/.test(l));
  fs.writeFileSync(path.join(BUILD, "warn-output.txt"), printed.join("\n") + "\n");
  const r = { status: (printed.find((l) => l.startsWith("status")) || "").split(":").slice(1).join(":").trim() };
  fs.writeFileSync(path.join(BUILD, "warn-result.json"), JSON.stringify({ ...r, printed }, null, 2));
  const colour = (l) => /^status\s*:\s*refused/.test(l) || /^reason/.test(l) ? "bad" : /^payments\s*:\s*0 /.test(l) ? "ok" : /^feed/.test(l) ? "k" : /^origin/.test(l) ? "c" : "";
  const lines = [
    { type: "cmd", text: `TARE_FEEDS="${SITE.replace("https://", "")}/records.json#${publisher.slice(0, 6)}…${publisher.slice(-4)}" node scripts/buy.mjs a` },
    ...printed.map((text) => ({ type: "out", text, cls: colour(text), pause: 320 })),
  ];
  const file = path.join(BUILD, "terminal.html");
  fs.writeFileSync(file, terminalHTML(lines));

  const page = await newPage(browser);
  await page.goto(`file://${file}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const rec = new Recorder(page, path.join(BUILD, "rec", "warn"));
  await rec.start();
  await sleep(400);
  await page.evaluate(() => window.play(28));
  await sleep(Math.max(1500, lineMs("warn", 0) + lineMs("warn", 1) - 5200));
  rec.mark("check-page");
  // the check page on the live site
  await page.goto(`${SITE}/check?url=${encodeURIComponent(sellers.a)}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await sleep(500);
  const res = page.locator("[data-check-result]");
  await res.scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => window.__tare.cursorTo(1500, 900));
  rec.mark("line-3");
  await page.evaluate(() => window.__tare.zoomTo(document.querySelector("[data-check-result]"), 1.25));
  await sleep(Math.max(2600, lineMs("warn", 2)));
  await page.evaluate(() => window.__tare.zoomTo(null, 1));
  await sleep(800);
  await rec.stop();
  await page.context().close();
}

(async () => {
  const browser = await chromium.launch();
  const all = timing.scenes.map((s) => s.id);
  const ids = WANT.length && WANT[0] !== "all" ? WANT : all;
  const wanted = (id) => ids.includes(id);
  console.log(`recording ${ids.join(", ")} (timing: ${timing.source})`);
  for (const s of timing.scenes.filter((s) => s.kind === "slide" && wanted(s.id))) await slide(browser, s.id);
  if (["console", "buy-a", "buy-a-again", "buy-b", "receipt"].some(wanted)) {
    const r = await consoleScenes(browser, wanted);
    fs.writeFileSync(path.join(BUILD, "console-result.json"), JSON.stringify(r, null, 2));
    for (const [k, v] of Object.entries(r)) console.log(`  ${k}: ${v.status} ${v.tx_hash ?? "-"}`);
  }
  if (wanted("warn")) await warnScene(browser);
  await browser.close();
})();
