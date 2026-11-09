# Tare — Memory

Running log of decisions, facts learned, and status. Newest entries at the top of each section.
Anyone (human or agent) picking this up should read this file and `SPEC.md` first.

## Status

- **Phase:** Core + web app built (2026-11-09). 87 tests pass. Next: live run (`docs/RUNBOOK.md`), then `node scripts/publish.mjs` and Vercel deploy (root `web/`).
- **System prompt sha256:** `7b5d603d7c140d3cf34afc3b525cac2e7ddb4bd001a092f26fa28c89437bec86`
- **Real testnet hash from seller B:** not yet. (Do not write one here until `kpass` returns it.)
- **Seller URLs:** not deployed yet. Code and guide ready (`sellers/README.md`); `sellers.json` holds nulls.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-11-08 | Sellers = vendored unchanged template in `sellers/wrapper/` (commit 893a275), two Render services from one repo | two origins, zero template edits, one-click deploy |
| 2026-11-08 | Upstream = raw GitHub pinned to a **commit SHA**; `UPSTREAM_URL=https://raw.githubusercontent.com` | template drops any path in UPSTREAM_URL; a SHA keeps body bytes stable (tag pushes are refused by this build environment's git proxy, and a SHA is stricter anyway) |
| 2026-11-08 | `.gitignore` uses `/data/`, not `data/` | `data/` also ignored `sellers/data/`; payloads were silently left out of the first sellers commit |
| 2026-11-08 | Seller A duplicates are r-0001..r-0380 re-used, shuffled with a seeded PRNG; null ts on every 31st row | deterministic, interleaved, exact counts |
| 2026-11-08 | `scripts/seller_probe.mjs` must pass before any kpass call | template silently defaults to mainnet if KITE_NETWORK is unset |
| 2026-11-08 | `serv_check.mjs` defaults to `max_completion_tokens`; `--cap-param=max_tokens` switches | SERV docs don't say which it accepts; the 400 error message tells us |
| 2026-11-08 | `openai@4.104.0` is the only dependency | per CLAUDE.md |
| 2026-11-09 | **Fail closed:** no count claim + nothing failed ⇒ `unverifiable`, origin held (blocklist reason `unverifiable`); `scripts/unblock.mjs` is the human override | review found a seller could pass by making no claims or steering SERV to nulls |
| 2026-11-09 | Buys run on one in-process promise queue; store mutations are synchronous read-modify-write | double clicks and overlapping UI buys cannot race or lose writes |
| 2026-11-09 | Idempotency replay is checked **before** the blocklist; UI creates `request_id` at page render | same request returns the same result; a double click reuses one id |
| 2026-11-09 | Any `pending` receipt for an origin refuses new buys to it | a crash mid-payment leaves an unknown settlement state; never pay twice into the unknown |
| 2026-11-09 | Shape failure skips SERV; SERV API errors are not retried (`SERV_API`); invalid output retried once (`SERV_INVALID`) | no wasted calls; one retry rule only for bad output |
| 2026-11-09 | `claimed_count` must be >= 0; empty `fields` array ⇒ null | tighter parse rule |
| 2026-11-09 | `store.kpass_calls` counter, shown in CLI (and UI later) | proves "refused before kpass" on screen |
| 2026-11-09 | `src/kpass.js` parser is PROVISIONAL (JSON or HTTP-dump; hash only if it is 0x + 64 hex, bare or base64 JSON `transaction`/`txHash`) | real output not captured yet; never fabricates |
| 2026-11-09 | Test 7 acknowledged as code-only; live injection resistance measured by `scripts/serv_eval.mjs` | a mocked SERV cannot prove model robustness |
| 2026-11-09 | CI: GitHub Actions runs `npm ci`, generator `--check`, `npm test` on a clean checkout | the `.gitignore` bug passed local tests |
| 2026-11-09 | Deferred to Day 4+: claims from the 402 `description` (#6), `count_qualifier` (#7), dispute evidence export (#8), explorer links (#9), `tareFetch` export (#11) | from the senior review; P1, after the live run |
| 2026-11-09 | All commits authored by Rita (`124313160+Ritapossible@users.noreply.github.com`), Claude credited via Co-Authored-By; history rewritten once and force-pushed; payload pin moved `02f239c` → `2303e9e8a14d7801369977668f6067fb5b49ef17` | owner asked to appear as the repo's contributor; noreply email always links to the GitHub account and keeps the personal email private |
| 2026-11-09 | Work moves to `main` (owner request); `ccr-aaaa0a55-l7co6h` kept until default branch is switched | one obvious branch for judges and clones |
| 2026-11-09 | Web app = static vanilla HTML/CSS/JS in `web/` (no framework, no build, no deps); visual style inspired by a reference landing page but with Tare's own brand, copy and logo; no charts (rule 8) | Vercel-ready as-is; no impersonation; keeps the dependency rule |
| 2026-11-09 | Two modes: live (`npm run app`, local API) and published (Vercel reads `web/data/state.json`) | payments need the human passkey on the operator's machine; Vercel can never pay |
| 2026-11-09 | Local API guards: 127.0.0.1 bind, Host allowlist, `X-Tare-Request` + JSON required, foreign Origin refused, seller key only (no URLs), request_id regex | the API spends testnet funds; any website could otherwise POST to localhost |
| 2026-11-09 | `publish.mjs` refuses malformed tx hashes and pending receipts; render shows only 0x+64-hex as a hash | rule 3: no invented hash can reach the public page |
| 2026-11-09 | Positioning: "Spending policies decide whether to pay. Tare checks what you got." Landing copy rewritten around delivery verification, with a "Not a spending policy" comparison section | the block-the-seller outcome made Tare look like one more spending policy, a crowded hackathon category |
| 2026-11-09 | User-facing "blocklist" → **seller record** (held / in good standing); `clean` shown as **Verified**, `refused` as **Stopped**; internal names unchanged (see SPEC "Positioning and terms") | changes how people read the product without churning the schema, tests or rules |
| 2026-11-09 | **Shared seller records approved by the owner** (reverses the 11-08 "no reputation feed" decision): opt-in feeds of held sellers with evidence; warn + stop before kpass; built Wed only if Tuesday's live-run gate passes; paid x402 lookup is a Friday stretch | judging rewards revenue potential and the Kite track says "pay on your behalf, safely"; a local-only record helped one agent and earned nothing |
| 2026-11-09 | Organiser reminder: tag @openservai on X; enable data collection in OpenServ org settings; redeem the $5 credit | submission checklist |
| 2026-11-09 | No extra credits needed: $5 SERV is enough, Kite faucet is free, Reppo/Dolphin credits are for other tracks | budget check |
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

- 2026-11-08: Template run locally with `KITE_NETWORK=testnet`: `/healthz` → `{"network":"eip155:2368","asset":"pieUSD","price":"$0.001"}`;
  `/v1/*` → 402 with base64 `PAYMENT-REQUIRED` = x402Version 2, scheme exact, amount `1000000000000000`,
  pieUSD asset, extra `{name: pieUSD, version: 1}`, maxTimeoutSeconds 60.
- 2026-11-08: With `KITE_NETWORK` unset the template offers **mainnet** (`eip155:2366`, USDC.e, amount 1000). The probe rejects it.
- 2026-11-08: `new URL("/a.json", "https://raw.githubusercontent.com/x/y")` → `https://raw.githubusercontent.com/a.json` (path dropped). Hence bare-host UPSTREAM_URL.
- 2026-11-08: Template forwards upstream headers (so raw GitHub's `text/plain` content type passes through) and settles only if upstream < 400. Tare parses body text itself, so content type does not matter. (Closes open question 4.)
- 2026-11-08: `inference-api.openserv.ai` is reachable from the build container. A bad key returns
  HTTP 401 with body `"Invalid API key"`; `serv_check.mjs` prints it and exits 1.
- _Still to fill from a real-key run: raw content, finish_reason, usage, whether `max_completion_tokens`
  is accepted. Then kpass execute output format and PAYMENT-RESPONSE encoding._

## Open questions

1. `kpass agent session execute` output format (body, headers, `--json`?).
2. `PAYMENT-RESPONSE` encoding: bare hash or base64 JSON with `transaction`.
3. SERV token-cap parameter name; is 120 enough at `reasoning_effort: low`.
