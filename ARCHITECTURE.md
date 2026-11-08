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
  server.js      local UI: GET / (receipts page), POST /buy?seller=a|b
scripts/
  serv_check.mjs Step 0 SERV smoke test
  kite_check.md  Step 0 Kite commands for the human
  buy.mjs        CLI: node scripts/buy.mjs <url> [--request-id X]
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

`buy()` takes `deps = { kpass, serv, store, now, newId }`. Production wires the real modules; tests
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
  "blocklist": { "https://seller-a.example": { "receipt_id": "rcpt_…", "at": "…" } },
  "idempotency": { "https://seller-a.example|…": "rcpt_…" }
}
```

`data/` is gitignored.

## Sellers (hosting)

The Kite template (`templates/typescript-express`, Express 5 + `@x402/express`) proxies every paid
`/v1/<path>` to `UPSTREAM_URL/<path>` and settles only when the upstream returns < 400. `/healthz`
is free. So each seller is:

- one deploy of the unchanged template (vendored in `sellers/wrapper/`) on its own host (two Render services ⇒ two origins),
- `UPSTREAM_URL=https://raw.githubusercontent.com` (bare host — the template drops any path in it),
- the payload file path in the buyer URL, pinned to tag `sellers-v1`.

Buyer URLs: `https://<seller-a-host>/v1/Ritapossible/tare/sellers-v1/sellers/data/a.json` (and `b.json` on the B host).
`scripts/seller_probe.mjs` checks each seller's 402 is testnet pieUSD 0.001 before any payment.
`config.js` refuses to start if the two origins are equal.

## Failure modes

| Failure | Result | Paid? | Blocked? |
|---|---|---|---|
| Origin blocklisted | `refused` | no | already |
| Repeat idempotency key | stored receipt | no (again) | unchanged |
| kpass error / non-200 | `failed` | no | no |
| 200, no PAYMENT-RESPONSE | `paid_unverified` | unknown, no hash shown | no |
| SERV invalid twice / API error | `paid_unchecked` | yes (real hash) | no |
| Body not JSON / rows not array | `dispute` (`shape`) | yes | yes |
| Any claim fails | `dispute` | yes | yes |
| All claims pass | `clean` | yes | no |

## Open questions (resolve in Step 0, then log in MEMORY.md)

1. `kpass agent session execute` output format: how the body and the `PAYMENT-RESPONSE` header are
   printed (is there a `--json` flag?). `kpass.js` parses whatever it really prints.
2. Whether `PAYMENT-RESPONSE` is the bare hash or base64 JSON containing it (x402 v2 typically
   base64-encodes a settlement object with `transaction`). Store the hash exactly as decoded.
3. SERV output-cap parameter name, and whether 120 tokens is enough with `reasoning_effort: low`.
