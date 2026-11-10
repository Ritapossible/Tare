# Tare — Memory

Running log of decisions, facts learned, and status. Newest entries at the top of each section.
Anyone (human or agent) picking this up should read this file and `SPEC.md` first.

## Status

- **Phase:** Live run re-done 2026-11-10 on the audited code (fixes 1-8, 11-14): A dispute paid `0xa239ac6d39c87ccda06a6fbe6458b162fa51eec3e75a34c648075e631803d79c`, A stopped, B verified paid `0x3f4740410068026e4d568bb5fcff98e8f1298e37bfb899ef1df1534e0a253219`; verified on-chain; published (rail recorded on receipts). Earlier run hashes `0xcb23c2e8f7…`, `0x222d5cfcb7…` remain valid on-chain.
- **System prompt sha256:** `7b5d603d7c140d3cf34afc3b525cac2e7ddb4bd001a092f26fa28c89437bec86`
- **Real testnet hashes (Kite testnet, verified on-chain):** first manual payment to B `0x7b93d0e5f0b72ffb919a0fc73acf6d8f840f000aa2588f2c441ae695156f693f`; Tare run: A `0xcb23c2e8f789145ab5e6741daaf53fd098f2c8dfd50333c2ad2af4117753635a`, B `0x222d5cfcb7d6c73c40676f8ac109c904f22a7f97ea9285be60859356b59e2b76`. Payer `0x7979989aD2A57dC6bBf28fFB120b18aC0aB10895` (testnet key), payee `0x9Ef47eA89403c6a2637271B655b0C5b99c68C447`, facilitator submitter `0x12343e649e6b2b2b77649dfab88f103c02f3c78b`.
- **Seller URLs:** live on Render (free tier, Oregon): `https://tare-seller-a.onrender.com`, `https://tare-seller-b.onrender.com`; both pass `seller_probe` (eip155:2368, pieUSD, amount 1000000000000000, payTo 0x9Ef4…C447). `sellers.json` filled.

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
| 2026-11-09 | Deferred to Day 4+ (402 `description` #6 now scheduled Thu 12 Nov): claims from the 402 `description` (#6), `count_qualifier` (#7), dispute evidence export (#8), explorer links (#9), `tareFetch` export (#11) | from the senior review; P1, after the live run |
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
| 2026-11-09 | Idea evaluation 41/60 (problem & demand 12/20, differentiation 11/15, timing 8/10, backer fit 10/15). Response: "check a seller" page + verified badge (Wed); 402-description promise + freshness claim + real-seller probe + library export (Thu); sourced figures in the write-up. No token, no consumer pivot. Targets in PLAN.md | the evaluator doubted demand ("anticipated, not demonstrated") and the user-facing hook, not the engineering |
| 2026-11-09 | **Do not name or cite other hackathon projects, past winners, or organiser posts anywhere in the build** (site, README, write-up, video, X post). Use ideas from them only as unattributed lessons | owner's decision: Tare stands on its own |
| 2026-11-09 | Edition 01 check (openserv.ai/hackathon, read 9 Nov): no listed winner or featured project verifies a paid delivery against the seller's own claims; the nearest checks price and trust *before* payment | the post-delivery lane is open; the edge is shipping real hashes |
| 2026-11-09 | Thursday additions: verbatim promise on the receipt page; three copy lines (capped time-limited session with no private key, pay-per-record needs counting, "independent"); evaluate SERV Prompt Guard against `serv_eval` | unattributed lessons from prior-edition entries and the ideas post |
| 2026-11-10 | Logo changed from the balance scale to logo A ("net bar") in the site's colours: outlined bar = promised, solid bar = delivered, orange dashed gap = shortfall. Favicon is a simplified version (two bars + orange dot) so it stays legible at 16px. Logo only: palette, type and layout unchanged; the full "receipt" redesign was shown and deferred | the scale read as law/justice; the new mark shows promised vs delivered |
| 2026-11-10 | SERV call uses **strict `json_schema` structured output** (the four claims, `additionalProperties: false`); system prompt and hash unchanged; parse rule still validates | without it the model answered in prose 5/6 times despite "JSON only"; `json_object` drifted to invented keys; strict schema returned the exact four keys every time |
| 2026-11-10 | Output cap 120 → **400** (`max_completion_tokens`) | at effort "low" reasoning used 24-138 tokens; 120 gave finish_reason "length" with empty content |
| 2026-11-10 | OpenAI SDK gets `fetch: globalThis.fetch` | lets Node honour an HTTPS proxy (NODE_USE_ENV_PROXY=1) in the cloud session; no change on a normal machine |
| 2026-11-10 | serv_eval adversarial cases all make a FALSE promise about seller A ("1240 unique") | two cases said "1240 records", which is true for A, so "clean" was the correct verdict and the old rubric mislabelled it unsafe |
| 2026-11-10 | **Payment rail `x402-direct` added and used for the published run** (owner approved): testnet-only key, Tare caps (0.05/payment, 1 total) + x402 spend controls, Pieverse facilitator settles on Kite testnet. `kpass` stays the default rail and was updated to 6.13.1 (`session execute --idempotency-key`) | Kite Passport (prod + dev) refuses hosts outside its executable catalog; a real hash beats none; honest disclosure in site FAQ, SPEC and write-up |
| 2026-11-10 | New deps pinned exactly: `@x402/fetch`, `@x402/evm`, `@x402/core` 2.25.0 and `viem` 2.56.3 | same x402 protocol revision as the deployed seller template; official client with EIP-3009 signing and spend controls |
| 2026-11-10 | Site copy no longer says Kite Passport makes every payment; "kpass calls" relabelled "Payment calls"; FAQ "How are payments made?" explains the catalog limit | rule 3 spirit: claims on the page must match what actually happened |
| 2026-11-10 | **Audit findings 1-8 fixed** with one regression test each (test/audit.test.js; each test fails when its fix is undone): prose tags stripped repeatedly incl. attributes; raw-log failures never change a payment outcome; payment idempotency key = `tare-` + sha256(origin|request_id); a timeout after a possible settlement leaves the receipt `pending` (outcome unknown, origin refused) instead of `failed`; x402-direct has a per-request timeout (90 s) and counts spend at signing; a non-200 reply with a settlement hash keeps the hash and disputes (`shape`) + holds the seller; `reset` keeps the lifetime spend ledger | independent audit: these could lose evidence, double-pay or break the injection boundary |
| 2026-11-10 | **Audit findings 11-14 fixed** with regression tests: probe checks every `accepts` offer (shares KITE_TESTNET constants); receipt page shows a hash only if it is 0x+64 hex; payment rail recorded on each receipt and published from the run, not the environment; no-hash label follows status ("paid, no hash", "outcome unknown", "not paid", "no valid hash") | what judges see must match what happened |
| 2026-11-10 | **Shared seller records built** (Day 4, live-run gate passed): records feed `/records.json` (v1), `/check` page, "Verified by Tare" badges (verified + good standing only, stale badges removed on publish), opt-in `TARE_FEEDS` checked before payment with explicit `--allow-feed-hold` override; feed problems noted on receipts, never blocking. Also fixed audit 15 (publish main check) and 17 (`--request-id` validation) | answers the evaluator's backer-fit doubt: a page people use and a reason for honest sellers to care |
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

- 2026-11-10 **kpass 6.13.1 differs from the hackathon brief:** login is `signup init/exchange` (new account) or `login init/verify` (OTP); a click on the emailed link completes sign-up in the dashboard, after which `signup exchange` fails with "invalid signup exchange token" and plain `login` works. `sandbox` exists but is hidden from `--help`. Payments are `kpass session execute --url … --idempotency-key …` (not `agent session execute`); in sandbox the account allowance is unavailable, so a separate passkey-approved session is required (`session create --separate`).
- 2026-11-10 **Faucet blocked:** with `sandbox on`, `kpass faucet drop --token pieUSD` → "Faucet is only available on staging/testnet environments. It is disabled on production." `--base-url https://passport.staging.gokite.ai` → "invalid auth session" (separate staging account; not pursued). `--base-url …/sandbox` → CLI aborted: "sandbox mode mismatch: server reported X-Kite-Mode=live … aborting to avoid acting on live data" (correct; not worked around). Public faucet faucet.gokite.ai gives 0.5 KITE (gas) to a connected browser wallet, no pieUSD visible.
- 2026-11-10 On-chain check: Kite testnet RPC chain id 0x940 (2368); pieUSD balance of 0x9Ef47eA89403c6a2637271B655b0C5b99c68C447 = 0.
- 2026-11-10 **pieUSD is being distributed on Kite testnet:** explorer (testnet.kitescan.ai API) shows sender `0x1315a1e8832f72dd77cce24427b8df7c9aee7836` behind most of the last 400 transfers: 103+28 drops of 5 pieUSD and 37+16 of 100 pieUSD, latest 2026-11-10 03:14 UTC; one recipient made 0.3 / 0.02 x402-sized payments minutes after its drop. Source of those drops unknown.
- 2026-11-10 **Staging Passport** (passport.staging.gokite.ai): account created for ritaextracrypto@gmail.com in an isolated config folder (prod login untouched), but its faucet is disabled for every token ("faucet is disabled"). **Dev** backend (passport.dev.gokite.ai) is reachable; not tried.
- 2026-11-10 **How testnet pieUSD was obtained:** the **dev** Passport backend's faucet works. Account created on dev (passport.dev.gokite.ai) with ritaextracrypto@gmail.com in an isolated config folder; `kpass faucet drop --recipient <prod wallet> --token pieUSD --base-url https://passport.dev.gokite.ai` → "Dropped 5 PIEUSD" (run twice). On-chain `balanceOf` on Kite testnet then read **10.0 pieUSD**. Prod faucet: disabled ("production"); staging faucet: disabled for all tokens.
- 2026-11-10 `kpass wallet balance` (sandbox mode) lists only USDC/PYUSD/USDG and never shows pieUSD; use the token contract's `balanceOf` on rpc-testnet.gokite.ai as the source of truth. `wallet address --chain kite` is rejected by the flag check, though the unfiltered list includes kite.
- 2026-11-10 **First payment blocked by Kite (prod, sandbox):** `kpass session execute --method GET --url <seller B> --idempotency-key tare-step6-b-20261110` → exit 6, `error_code: payment_target_forbidden`, `reason: host_not_in_executable_catalog`, "Only hosts returned by `ksearch service list` are executable by default … ask Kite to approve the host or whitelist your account for partner testing." No payment made. The catalog (`ksearch service list --payment-approach x402`) is mostly Base USDC services; no pieUSD/testnet seller listed. Becoming a listed seller (`kpass agent create --kind seller`) needs `kpass identifier claim` + `kpass onboarding submit` and does not clearly add a host to the payment catalog.
- 2026-11-10 **Dev backend** did not raise the host error before the allowance check ("allowance_unavailable") after registering a dev agent; whether dev enforces the catalog is unknown until a passkey-approved dev session tries to pay.
- 2026-11-10 **Dev enforces the catalog too:** dev wallet `0xda9A8419F89525A88f9959F6E5ED82Cb8959D1a2` funded with 5 pieUSD (on-chain); owner approved a dev session (expires 10:34 UTC); `session execute` to seller B → same `payment_target_forbidden / host_not_in_executable_catalog`. Nothing paid. Conclusion: Kite Passport (prod and dev) will not pay Tare's sellers until Kite allowlists the hosts or the account.
- 2026-11-10 **x402-direct live:** testnet wallet `0x7979…0895` funded 5 pieUSD from the dev faucet; first payment to seller B → HTTP 200, PAYMENT-RESPONSE `{"success":true,"payer":"0x7979…","transaction":"0x7b93d0e5f0b72ffb919a0fc73acf6d8f840f000aa2588f2c441ae695156f693f","network":"eip155:2368"}`, receipt SUCCESS (block 22043901), Transfer 0.001 pieUSD payer → PAY_TO; tx submitted (and gas paid) by facilitator `0x1234…c78b`. ~4 s end to end. Token also emits EIP-3009 `AuthorizationUsed` (empty data) besides Transfer.
- 2026-11-10 **Full Tare run (reset → A → A → B, real SERV, x402-direct):** A dispute (claims 1240/unique/id,ts/no_nulls; measured 1240 rows, 860 unique; failed count, unique, no_nulls; held); A refused "seller held (dispute)", payment counter unchanged; B clean (200/200). Wallet 4.997 pieUSD after 3 payments.
- 2026-11-10 Post-fix live check: one real x402-direct payment to seller B (scratch store) → 200, `0x557a5d84cdf466f0415b94923ecc141dd4cbd720b8b7a173faabf81309058b0b`, on-chain SUCCESS 0.001 pieUSD; ledger counted at signing.
- 2026-11-10 **Feed warning, live:** a second agent with an empty store, trusting only `https://tare-agent.vercel.app/records.json`, tried to buy seller A → `refused`, "held in trusted feed … (dispute)", 0 payment attempts. Hosted feed, badge (`/badges/tare-seller-b.onrender.com.svg`, image/svg+xml) and `/check` all serve 200.
- 2026-11-10 kpass 6.13.1 payment command is `kpass session execute --method GET --url <url> --idempotency-key <key> --output json` (not `agent session execute`); `src/kpass.js` must be updated.
- 2026-11-10 Testnet Ozone (testnet.gokite.ai) is gone (no DNS); it was an older campaign whose faucet gave KITE only.
- 2026-11-10 pieUSD testnet contract (0x3812…621A, total supply 1,000,000) has `mint(address,uint256)` gated by `Ownable`: a dry-run `eth_call` mint from a random address reverts `OwnableUnauthorizedAccount` (0x118cdaa7); from the owner `0xcff44fa0c670644068f8b2bdab3160a9671cff52` it would succeed. No public mint/faucet function. Only Kite/Pieverse can supply testnet pieUSD.

- 2026-11-10 **SERV live (real key, via session proxy):** `max_completion_tokens` is accepted; a system message + `reasoning_effort: "low"` works; `response_format` `json_schema` strict is supported. Step 0 output: `{"claimed_count":1240,"unique":true,"fields":["id","ts"],"no_nulls":true}`, finish_reason stop, 86 completion tokens (50 reasoning), 247 prompt tokens.
- 2026-11-10 **Without structured output** the model replied in prose 5 of 6 times ("Received: 1,240 unique records…").
- 2026-11-10 **Prose with no claim** ("Here is your data.") returns finish_reason `content_filter` ("I can't share that.") under strict schema → SERV_INVALID → `paid_unchecked`, not `unverifiable`. Safe (no clean, no block) but not the fail-closed hold; noted for Thursday.
- 2026-11-10 **serv_eval runs** (same prompt hash 7b5d603d…): run 1 accuracy 5/7, safety 4/5 (one "unsafe" was a rubric error); run 2 accuracy 5/7, safety 4/5 (same rubric error, other case); **final run 3 accuracy 5/7, safety 5/5**. Results vary run to run.
- 2026-11-10 **Known model weakness:** SERV sometimes invents a field from the wording (`["records"]`, `["registros"]`). On an honest seller that would cause a false `fields` dispute. Did not happen on seller B's prose in any run. Candidate fix (Thursday): keep a claimed field only if it appears in the prose as a field name.
- 2026-11-10 **Fake-tag injection partly worked:** after a fake `</prose>`, SERV extracted `claimed_count: 860` from the injected text; still a dispute because `unique` failed (defence in depth).
- 2026-11-10 **kpass install:** `curl -fsSL https://cli.gokite.ai/install.sh | bash` (macOS/Linux; Windows: `irm https://cli.gokite.ai/install.ps1 | iex`); needs `jq`; installs to `~/.kpass`, adds `~/.local/bin` to PATH, verifies SHA-256 checksums. **Login comes first:** `kpass login init --email …` then `kpass login verify --login-id … --code …`; the passkey is created from the emailed link and session approval opens a URL approved with that passkey (can be done on a phone).

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
