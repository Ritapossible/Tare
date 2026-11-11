# Tare — Architecture

## One picture

```
            your laptop (buyer)                                  public internet
 ┌──────────────────────────────────────────┐
 │  ui (127.0.0.1:4020)   scripts/buy.mjs   │
 │          │                  │            │
 │          └──────► buy() ◄───┘            │
 │                   │                      │
 │   1 blocklist? ───┤ yes → refused (stop) │
 │   2 idempotency ──┤ seen → stored receipt│
 │   3 kpass.execute ┼──────────────────────┼──► Kite Passport ──► Seller A (origin 1) ─► upstream JSON
 │                   │   body + hash        │      (testnet,        Seller B (origin 2) ─► upstream JSON
 │   4 serv.extract ─┼──── prose only ──────┼──► SERV Reasoning     x402 Express template
 │   5 check(rows)   │   claims JSON        │      (claims only)
 │   6 store         │                      │
 └───────────────────┴──────────────────────┘
```

Tare (the buyer agent) runs on the human's machine: `kpass` needs a passkey approval that is never
automated. Only the two sellers are hosted.

## Trust boundaries

| Input | Trusted? | Handling |
|---|---|---|
| Seller prose | No | Sent to SERV inside `<prose>` tags; tags in the text are stripped |
| Seller rows | No | Never sent to SERV; only counted by `check.js` |
| SERV output | No | Whitelisted to four typed fields; anything else dropped |
| `kpass` output | Yes, for payment facts | Hash taken only from `PAYMENT-RESPONSE`; absent ⇒ no hash |
| Seller URL from user | Yes | `new URL()` parsed; origin is the blocklist key |

The decision path (`check.js` → `buy.js`) never reads a string the model wrote except the four
typed claim values.

## Modules

```
src/
  prompt.js      SYSTEM_PROMPT (verbatim) + PROMPT_SHA256
  serv.js        extractClaims(prose, { client }) → claims | throws ServInvalidError
                 parseClaims(text) → claims | null  (pure; the parse rule)
  check.js       check(body) → { count, unique_count, failed: [rule…], verdict }  (pure)
  kpass.js       execute(url) → { status, bodyText, paymentHash|null, raw }
                 spawns `kpass` with an argv array (no shell)
  store.js       JSON file at data/store.json: receipts, blocklist, idempotency index
                 atomic write (tmp file + rename)
  buy.js         buy(url, { requestId, deps }) — the payment order from SPEC.md
  config.js      loads sellers.json, asserts distinct origins
  tare.js        production wiring (real SERV, real kpass, file store, raw kpass log)
  state.js       the state shape the web app reads (live or published)
  records.js     seller records (held / in good standing + evidence) and "Verified by Tare" badges
  feeds.js       opt-in trusted feeds (TARE_FEEDS): validate, check an origin before payment
  server.js      local console server: static web/ + guarded /api/state, /api/buy (127.0.0.1 only)
web/             static site + app, deployable as-is (Vercel root = web/)
  index.html     landing · app/{index,receipt,sellers}.html · docs/index.html · 404.html
  assets/        styles.css, layout.js (nav/footer), render.js (pure, escaped), console.js, icons.js
  data/state.json  published run (read-only mode); written by scripts/publish.mjs
  records.json   published seller-records feed (opt-in for other agents)
  badges/        "Verified by Tare" SVG badges, verified sellers only
  check.html     "Check a seller" page (assets/records-view.js, pure + escaped)
  vercel.json    clean URLs + security headers
  server.js      local UI: GET / (receipts page), POST /buy?seller=a|b
scripts/
  serv_check.mjs Step 0 SERV smoke test
  kite_check.md  Step 0 Kite commands for the human
  buy.mjs        CLI: node scripts/buy.mjs <a|b|url> [--request-id X]; raw kpass → data/kpass_raw.log
  unblock.mjs    human override for one origin
  serve.mjs      npm run app → live console on 127.0.0.1:4020
  publish.mjs    store → web/data/state.json (refuses malformed hashes / pending receipts)
  serv_eval.mjs  live SERV accuracy + injection-safety eval
  reset.mjs      wipes data/store.json for a clean demo take
  seller_probe.mjs  no-payment 402 check: testnet pieUSD 0.001, distinct origins
sellers/
  generate.mjs   deterministic payload generator → sellers/data/a.json, b.json
  data/          committed payloads (the upstream for each seller)
  wrapper/       unchanged Kite x402 Express template (Apache-2.0, commit 893a275)
  README.md      how to deploy each origin from the Kite template
test/
  *.test.js      node:test, SERV and kpass injected as fakes
sellers.json     { "a": "https://…/v1/a.json", "b": "https://…/v1/b.json" }
```

Dependencies are kept tiny: `openai` (SDK, pointed at SERV) and Node 22 built-ins
(`node:test`, `node:http`, `node:crypto`, `node:child_process`). No framework for the UI.

## Dependency injection

`createBuyer(deps)` takes `deps = { store, kpass, extract, promptSha256, now, newId }` and returns
`buy(url, { requestId })`. Buys are chained on one promise queue, so they run strictly one at a time. Production wires the real modules; tests
pass fakes that record calls. This is how tests prove "kpass not called" without network.

## Data model (`data/store.json`)

```json
{
  "receipts": [{
    "id": "rcpt_…",
    "request_id": "…",
    "idempotency_key": "https://seller-a.example|…",
    "url": "https://seller-a.example/v1/a.json",
    "origin": "https://seller-a.example",
    "status": "dispute",
    "tx_hash": "0x… (from PAYMENT-RESPONSE only) | null",
    "body_sha256": "…",
    "prompt_sha256": "…",
    "claims": { "claimed_count": 1240, "unique": true, "fields": ["id","ts"], "no_nulls": true },
    "count": 1240,
    "unique_count": 860,
    "failed": ["count", "unique", "no_nulls"],
    "error": null,
    "created_at": "2026-11-…"
  }],
  "blocklist": { "https://seller-a.example": { "receipt_id": "rcpt_…", "reason": "dispute", "at": "…" } },
  "idempotency": { "https://seller-a.example|…": "rcpt_…" },
  "kpass_calls": 1
}
```

`data/` is gitignored.

## Sellers (hosting)

The Kite template (`templates/typescript-express`, Express 5 + `@x402/express`) proxies every paid
`/v1/<path>` to `UPSTREAM_URL/<path>` and settles only when the upstream returns < 400. `/healthz`
is free. So each seller is:

- one deploy of the unchanged template (vendored in `sellers/wrapper/`) on its own host (two Render services ⇒ two origins),
- `UPSTREAM_URL=https://raw.githubusercontent.com` (bare host — the template drops any path in it),
- the payload file path in the buyer URL, pinned to commit `2303e9e8a14d7801369977668f6067fb5b49ef17`.

Buyer URLs: `https://<seller-a-host>/v1/Ritapossible/tare/2303e9e8a14d7801369977668f6067fb5b49ef17/sellers/data/a.json` (and `b.json` on the B host).
`scripts/seller_probe.mjs` checks each seller's 402 is testnet pieUSD 0.001 before any payment.
`config.js` refuses to start if the two origins are equal.

## Failure modes

| Failure | Result | Paid? | Blocked? |
|---|---|---|---|
| Repeat idempotency key (checked first) | stored receipt, `replayed` | no (again) | unchanged |
| Origin blocklisted | `refused` | no | already |
| Unresolved `pending` for origin | `refused` | no | no |
| kpass error / non-200 | `failed` | no | no |
| 200, no PAYMENT-RESPONSE | `paid_unverified` | unknown, no hash shown | no |
| SERV invalid twice / API error | `paid_unchecked` | yes (real hash) | no |
| Body not JSON / rows not array | `dispute` (`shape`) | yes | yes |
| Any claim fails | `dispute` | yes | yes |
| No count claim, nothing failed | `unverifiable` | yes | yes (human may unblock) |
| All claims pass | `clean` | yes | no |

## Step 0 questions (resolved 10 Nov; details in MEMORY.md)

1. ~~kpass output format~~ Only error output has been seen: Kite refuses uncatalogued sellers
   (`host_not_in_executable_catalog`), so a successful `kpass session execute` reply is still unseen.
   `kpass.js` parses JSON or an HTTP-style dump and returns no hash when it finds none. If the reply
   turns out to carry no hash, the hash is in `kpass activity --kind x402_payment --output json`.
2. ~~PAYMENT-RESPONSE encoding~~ Base64 JSON with `transaction` (seen on the x402-direct rail).
   A bare hash is also accepted.
3. ~~SERV output cap~~ `max_completion_tokens`; 120 gave `finish_reason: "length"`, so the cap is 400
   with a strict JSON schema.
