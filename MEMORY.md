# Tare — Memory

Running log of decisions, facts learned, and status. Newest entries at the top of each section.
Anyone (human or agent) picking this up should read this file and `SPEC.md` first.

## Status

- **Phase:** Day 1, docs written. Next: `package.json`, `src/prompt.js`, `scripts/serv_check.mjs`.
- **Real testnet hash from seller B:** not yet. (Do not write one here until `kpass` returns it.)
- **Seller URLs:** not deployed yet.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-11-08 | Kite track, not Open | The capped Passport session is the spending-limit primitive the Kite track is about |
| 2026-11-08 | Pay first, verify after, refuse the *next* payment | x402 returns the body only after payment; there is nothing to count before paying |
| 2026-11-08 | Idempotency key = origin + request_id, created before `execute`; `pending` written before paying | body hash is only known after payment; pending record prevents a double pay on crash/retry |
| 2026-11-08 | Sellers on two separate origins | blocklist key is the origin; two paths on one host would block both |
| 2026-11-08 | SERV extracts four claims: `claimed_count`, `unique`, `fields`, `no_nulls` | one integer is a words-to-number job; four claims make SERV earn its place while code still decides |
| 2026-11-08 | Seller A = 1240 rows, 380 repeated ids (860 unique), 40 null `ts` | realistic dirty delivery, not a seller contradicting `.length` |
| 2026-11-08 | Any SERV type failure (e.g. `claimed_count: "1240"`) counts as invalid ⇒ one retry ⇒ `SERV_INVALID` | one parse rule, no silent coercion |
| 2026-11-08 | SERV failure after payment ⇒ `paid_unchecked`, real hash kept, no block | payment already happened; do not dispute without a check |
| 2026-11-08 | `no_nulls` without `fields` checks every key | prose may say "no nulls" without naming fields |
| 2026-11-08 | Malformed body (not JSON / rows not array) ⇒ dispute with rule `shape` | a paid but unreadable delivery is a failed delivery |
| 2026-11-08 | Buyer runs locally; only sellers are hosted | `kpass` needs the human's passkey; Kite Passport calls sellers from its servers so they must be public HTTPS |
| 2026-11-08 | Sellers = unchanged Kite `typescript-express` template; payload JSON served from a static upstream | the template is a paid proxy to `UPSTREAM_URL` |
| 2026-11-08 | No shared reputation feed this week | second product; one sentence in the write-up |
| 2026-11-08 | `scripts/reset.mjs` clears local store | needed to re-record the demo |

## Facts learned (from docs)

- Kite template repo: `gokite-ai/kite-x402-services`. Templates: `typescript-express` (Node 22,
  Express 5, `@x402/express`) and `go-gin`. **Not Hono.**
- Template env: `PAY_TO`, `KITE_NETWORK`, `UPSTREAM_URL`, `PRICE_USD`, optional `UPSTREAM_AUTH_HEADER`/`UPSTREAM_AUTH_VALUE`.
- Paid paths: `/v1/*` proxied to `UPSTREAM_URL` with `/v1` stripped. `/healthz` free. Settles only if upstream < 400.
- Testnet: CAIP-2 `eip155:2368`, pieUSD `0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A` (18 dp), EIP-712 domain `pieUSD` v`1`.
- Facilitator `https://facilitator.pieverse.io/v2` — the `/v2` is required.
- Kite Passport calls the seller from its servers ⇒ localhost and browser-gated tunnels do not work.
- Headers: `PAYMENT-REQUIRED` (402, base64 JSON), `PAYMENT-SIGNATURE` (buyer retry), `PAYMENT-RESPONSE` (200, settlement tx hash).
- SERV multipath: append `-serv-multipath` to a catalog model. It transforms the system prompt into
  a reasoning prompt (cached per prompt+version); the upstream model still runs every request.
  It does not execute branches or authorize actions.
- SERV docs page does **not** document `max_tokens` vs `max_completion_tokens`, `temperature`, or
  response graph fields — confirm in Step 0.
- Hackathon judging: creativity, user readiness, revenue potential. SERV Reasoning required in every track.

## Facts learned (from running things)

_Empty. Fill in from Step 0: serv_check raw output, token-cap parameter, kpass execute output format,
PAYMENT-RESPONSE encoding._

## Open questions

1. `kpass agent session execute` output format (body, headers, `--json`?).
2. `PAYMENT-RESPONSE` encoding: bare hash or base64 JSON with `transaction`.
3. SERV token-cap parameter name; is 120 enough at `reasoning_effort: low`.
4. Does the template pass `text/plain` upstream bodies through unchanged.
