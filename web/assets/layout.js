// Shared chrome: floating nav, mobile menu, footer, pixel sprinkles. Every page imports this.
import { icons } from "./icons.js";

export const REPO = "https://github.com/Ritapossible/Tare";

const SITE_LINKS = [
  ["How it works", "/#how"],
  ["Who decides", "/#roles"],
  ["The demo", "/#demo"],
  ["FAQ", "/#faq"],
  ["Docs", "/docs"],
];
const APP_LINKS = [
  ["Console", "/app"],
  ["Sellers", "/app/sellers"],
  ["Docs", "/docs"],
  ["Site", "/"],
];

function current(href) {
  const here = location.pathname.replace(/\/index(\.html)?$/, "/").replace(/\.html$/, "").replace(/\/$/, "") || "/";
  const target = href.replace(/\/$/, "") || "/";
  return here === target ? ' aria-current="page"' : "";
}

function nav(kind) {
  const links = kind === "app" ? APP_LINKS : SITE_LINKS;
  const cta = kind === "app"
    ? `<a class="btn btn-ghost btn-sm" href="${REPO}" target="_blank" rel="noopener">${icons.github} GitHub</a>`
    : `<a class="btn btn-orange btn-sm" href="/app">Open the console ${icons.arrow}</a>`;
  return `
  <nav class="nav" aria-label="Main">
    <a class="brand" href="/">${icons.logo}<span>Tare</span></a>
    <div class="nav-links">${links.map(([t, h]) => `<a href="${h}"${current(h)}>${t}</a>`).join("")}</div>
    <div class="nav-cta">${cta}</div>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open menu">${icons.menu}${icons.close}</button>
    <div class="mobile-menu" id="mobile-menu">
      ${links.map(([t, h]) => `<a href="${h}">${t}</a>`).join("")}
      <a class="btn btn-white" href="${REPO}" target="_blank" rel="noopener">View on GitHub</a>
      ${kind === "app" ? "" : `<a class="btn btn-blue" href="/app">Open the console</a>`}
    </div>
  </nav>`;
}

function footer() {
  return `
  <footer class="footer">
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <a class="brand" href="/">${icons.logo}<span>Tare</span></a>
          <p class="dim" style="max-width:42ch;margin-top:18px">A buyer agent that checks what it paid for. Built for SERV Hackathon 02, Kite track. Kite testnet and faucet pieUSD only.</p>
        </div>
        <div>
          <h4>Product</h4>
          <ul>
            <li><a href="/#how">How it works</a></li>
            <li><a href="/app">Console</a></li>
            <li><a href="/app/sellers">Sellers</a></li>
            <li><a href="/#faq">FAQ</a></li>
          </ul>
        </div>
        <div>
          <h4>Build</h4>
          <ul>
            <li><a href="/docs">Docs</a></li>
            <li><a href="${REPO}" target="_blank" rel="noopener">GitHub</a></li>
            <li><a href="${REPO}/blob/main/SPEC.md" target="_blank" rel="noopener">Spec</a></li>
            <li><a href="${REPO}/blob/main/LICENSE" target="_blank" rel="noopener">MIT license</a></li>
          </ul>
        </div>
      </div>
      <p class="small">SERV reads the label. Code counts and decides. Kite Passport pays. Every hash shown here was returned by kpass.</p>
      <div class="footer-word" aria-hidden="true">Tare<span>.</span></div>
    </div>
  </footer>`;
}

export function sprinkle(el, count = 26) {
  if (!el) return;
  const colors = ["#f97316", "#1d9bf0", "#c2410c", "#56b4ec"];
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "sprinkle";
    // Keep sprinkles in the side margins so they never sit on text.
    const side = Math.random() < 0.5 ? Math.random() * 12 : 86 + Math.random() * 12;
    s.style.left = `${side.toFixed(1)}%`;
    s.style.top = `${Math.round(Math.random() * 96)}%`;
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${(Math.random() * 5).toFixed(2)}s`;
    el.appendChild(s);
  }
}

export function mountLayout(kind = "site") {
  const header = document.querySelector("[data-nav]");
  if (header) header.innerHTML = nav(kind);
  const foot = document.querySelector("[data-footer]");
  if (foot) foot.outerHTML = footer();

  const navEl = document.querySelector(".nav");
  const btn = navEl?.querySelector(".menu-btn");
  btn?.addEventListener("click", () => {
    const open = navEl.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  navEl?.querySelectorAll(".mobile-menu a").forEach((a) =>
    a.addEventListener("click", () => {
      navEl.classList.remove("open");
      btn?.setAttribute("aria-expanded", "false");
    }),
  );
  document.querySelectorAll("[data-sprinkle]").forEach((el) => sprinkle(el, Number(el.dataset.sprinkle) || 26));
  document.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icons[el.dataset.icon] ?? "";
  });
}
