# Tare — Plan

Today: Sun 8 Nov 2026. Deadline: Sun 15 Nov 2026, 23:59 UTC.
**Target submission: Sat 14 Nov.** Sunday is buffer only.

Legend: 🧑 = the human must do it (keys, passkey, deploy accounts, video). 🤖 = code.

## Day 1 — Sun 8 Nov · Foundation + Step 0
- [x] 🤖 Docs: SPEC, ARCHITECTURE, PLAN, MEMORY, CLAUDE.md, README skeleton, LICENSE, .env.example
- [x] 🤖 `package.json` (Node 22, ESM, `npm test` = `node --test`), `src/prompt.js` (+ 6 tests)
- [x] 🤖 `scripts/serv_check.mjs` (error path verified: 401 on a bad key, exit 1)
- [x] 🧑 Create SERV key at https://console.openserv.ai, put it in `.env`, run `node scripts/serv_check.mjs` (passed 10 Nov)
- [x] 🤖 Record in MEMORY.md: token-cap param, `finish_reason`, raw output shape (strict json_schema + cap 400)
- [x] 🧑 Install `kpass`, run the first five commands in `scripts/kite_check.md` (10 Nov; kpass 6.13.1: prod faucet disabled, pieUSD from the dev faucet)

**Gate:** serv_check prints valid claims JSON. If it fails, stop and fix before anything else.

## Day 2 — Mon 9 Nov · Sellers live
- [x] 🤖 `sellers/generate.mjs` → `sellers/data/a.json`, `b.json` (deterministic, asserted counts, drift test)
- [x] 🤖 `sellers/README.md`: deploy steps for the Kite Express template, twice
- [x] 🤖 `sellers/wrapper/`: unchanged template copy; ran locally on testnet, 402 challenge verified
- [x] 🤖 `scripts/seller_probe.mjs`: no-payment check that a seller charges testnet pieUSD 0.001 on distinct origins
- [x] 🧑 Create a seller wallet (PAY_TO), deploy seller A and seller B as two services on two hosts (Render, 10 Nov; PAY_TO = Passport wallet)
- [x] 🧑 `node scripts/seller_probe.mjs <A url> <B url>` → both `RESULT : ok`
- [x] 🧑 `kpass session execute` against seller B (10 Nov) → refused by Kite: `host_not_in_executable_catalog` (prod and dev); payment made via `x402-direct` instead
- [x] 🤖 Record real kpass output format in MEMORY.md (error JSON only; no successful kpass payment yet); `sellers.json` filled

**Gate:** one real testnet hash from seller B exists and is pasted in the README.

## Day 3 — done early on Mon 9 Nov · Core logic + tests
- [x] 🤖 `check.js` + tests (shape, count, unique, fields, no_nulls, fail-closed `unverifiable`)
- [x] 🤖 `serv.js` parse rule + retry + tests (string count, extra verdict, invalid ×2, API error)
- [x] 🤖 `store.js` (atomic JSON, kpass call counter)
- [x] 🤖 `kpass.js` updated to 6.13.1 (`session execute --idempotency-key`); success output still unseen (Kite blocks uncatalogued hosts). Added `x402-direct` rail (10 Nov) and used it for the live run
- [x] 🤖 `buy.js` payment order + all 10 spec tests + P0 fixes (queue, pending lock, replay-first); mutation-checked
- [x] 🤖 `config.js` distinct-origin assertion + test
- [x] 🤖 CLI: `scripts/buy.mjs`, `reset.mjs`, `unblock.mjs`; live eval `scripts/serv_eval.mjs`; CI workflow; `docs/RUNBOOK.md`

**Gate:** `npm test` green, all 10 spec tests present by name.

## Before Tue (🧑, 5 min) · OpenServ account checks (from the organisers' reminder email)
- [ ] 🧑 Confirm the $5 SERV credit is **redeemed** and shows in the balance at https://console.openserv.ai (credit redemption section)
- [ ] 🧑 Enable **data collection** in org settings: https://console.openserv.ai/settings/organization
- [x] 🧑 Vercel deploy: live at https://tare-agent.vercel.app (root `web/`)

## Live day — Tue 10 Nov · run `docs/RUNBOOK.md` (🧑), then parser rewrite + first end-to-end run (🤖)
- [x] 🧑 Steps 1-6 of the runbook (10 Nov): SERV passed; Kite login/sandbox; testnet pieUSD via dev faucet; sellers live; first real payment
- [~] 🤖 `src/kpass.js` on the 6.13.1 command + JSON error handling; success output still unseen until Kite allowlists the sellers
- [x] 🧑 Live run: reset → buy A → buy A → buy B (10 Nov, real hashes, published)

**Gate (decides whether Wed builds shared records):** dispute with a real hash, stopped with no hash
and kpass not called, verified with a real hash.

## Day 4 — Wed 11 Nov · Shared seller records + "check a seller" (only if Tuesday's gate passed)
Goal: a person can use Tare, and honest sellers have a reason to care (evaluation: backer fit 10/15).
- [x] 🤖 Publish held sellers as a public feed `web/records.json`: one entry per held origin with its
      evidence (promised vs delivered, failed checks, settlement hash, body sha256, prompt sha256, time)
- [x] 🤖 Before each buy, read the feeds the operator chooses to trust (`TARE_FEEDS`); a seller held
      in a trusted feed is **warned** and stopped before kpass until a human allows it
- [x] 🤖 **"Check a seller" page** (`/check`): paste an x402 seller URL → in good standing / held with
      evidence / never checked. This is the human-facing entry point.
- [x] 🤖 **"Verified by Tare" badge**: a small SVG per origin, served from the published records, that
      an honest seller can embed. Only sellers with a verified receipt get it; held sellers never do.
- [x] 🤖 Tests: trusted feed hit stops before kpass; untrusted or unreachable feed never blocks a buy
      silently (the receipt says what happened); malformed feed entries are ignored; feed contains no
      hash that kpass did not return; badge never says verified for a held or unchecked origin
- [ ] 🤖 Write-up limits: only feeds you choose to trust (no global blacklist), evidence on every
      record, records are per origin (a seller can move domain; Kite agent identity is the next step)

## Day 5 — Thu 12 Nov · Real promises, real sellers, then the story
Goal: show the problem instead of predicting it (evaluation: problem & demand 12/20, differentiation 11/15).
Morning:
- [x] 🤖 **Promise from the 402 response**: read the seller's own `description` in PAYMENT-REQUIRED
      (made before any money moves) and check it against the delivery, alongside the body prose.
      Works on any x402 seller as it exists today, not only ours.
- [x] 🤖 **Freshness claim**: SERV extracts a claimed time window ("records from the last 24 hours");
      code checks it against the row timestamps. Stale data sold as fresh is the common real failure.
      New prompt ⇒ new prompt hash; update SPEC parse rule and tests.
- [x] 🧑 Re-run `node scripts/serv_eval.mjs` with the new claims; paste the output
- [x] 🤖 **Promise shown word for word** on the receipt page, next to the claims SERV extracted from it,
      so every verdict is visibly grounded in the seller's own sentence (escaped; display only, the
      decision path is unchanged)
- [x] 🤖 **Copy lines** on the landing page and in the write-up (no attribution to anyone):
      "Your agent shops inside a capped, time-limited session and never holds a private key. Tare
      checks what it brought home." · "Pay per record? Then someone has to count the records." ·
      describe Tare as an **independent** check of what a seller delivered
Afternoon:
- [ ] 🤖 **SERV Prompt Guard**: read its docs; enable it on the claim-extraction call only if it fits
      the documented API and keeps the system prompt + `<prose>` contract. Re-run `serv_eval` with and
      without it and keep whichever is safer; record the numbers in MEMORY.md. No undocumented APIs.
- [x] 🤖 **Real-seller probe** (10 Nov: `scripts/real_probe.mjs` on the public x402 discovery list; found SERV inventing claims ⇒ full code-side grounding; results in WRITEUP): run the no-payment 402 probe and the description check against real
      public x402 services (start with those listed in `gokite-ai/kite-x402-services`). Report what was
      found, honest or not; never claim a mismatch that was not observed.
- [ ] 🤖 **Library export**: `verify(promise, body)` and `tareFetch(url)` with a three-line "add Tare to
      your agent" section in the README and docs
- [ ] 🤖 Fix whatever the live run surfaced; readable error text (SERV_INVALID, paid_unverified, kpass failed)
- [x] 🤖 README complete: two sentences, SERV key + $5 credit note, Kite commands, `npm test`, three "do X, see Y", model id, "code, not SERV, counts and decides"
- [~] 🤖 `docs/WRITEUP.md` (drafted 10 Nov; real-seller probe + sourced figures still TODO): what Tare does, how SERV Reasoning powers it, which track (Kite), what was
      built during the hackathon, live `serv_eval` numbers, real-seller probe results, shared records
      and their limits; testnet is a hackathon rule and switching network is one setting
- [ ] 🧑 Find 2-3 **sourced** figures on agent payments / x402 adoption for the write-up (no invented numbers)
- [x] 🤖 Draft X post (tags **@openservai**) and video script (< 90 s)

## Day 6 — Fri 13 Nov · Record + stretch
- [ ] 🧑 Record the video from a fresh `reset`: A dispute → A stopped → B verified → another agent
      warned by the record → the "check a seller" page with the badge
- [ ] 🤖 Stretch, only if all of the above is done: serve the records feed behind x402 with the same
      Kite seller template (0.001 pieUSD per lookup) as the revenue story

## Evaluation targets (idea score 41/60 on 9 Nov)
| Category | Was | Lever | Target |
|---|---|---|---|
| Problem & demand | 12/20 | 402-description promise, freshness claim, real-seller probe, sourced figures | 15-17 |
| Backer fit | 10/15 | "check a seller" page, verified badge (two-sided), library export | 12-13 |
| Differentiation | 11/15 | promise made before payment, recomputable evidence | 12-13 |
| Timing | 8/10 | none needed | 8 |

## Day 7 — Sat 14 Nov · Submit
- [ ] 🧑 Repo public, video uploaded
- [ ] 🧑 X post live and tagging **@openservai** (link goes in the form)
- [ ] 🧑 Re-check data collection is enabled in OpenServ org settings
- [ ] 🧑 Submit at https://openserv.typeform.com/submissions02 (Kite track)

## Audit (10 Nov) — 26 findings
- [x] 🤖 Findings 1-8 (injection boundary, lost hash, double payment, spend cap) fixed + regression tests
- [x] 🤖 11-14 fixed + regression tests; live run re-done and republished on the fixed code
- [ ] 🤖 Then: 9-10, 15-26 (UTF-8 chunks, raw body hash, publish path, CLI edge cases, server null body, dispute counts, esc() on numbers, fake-looking fixtures, stale comments, duplicated constants, serv_check reuse, serve.mjs cleanup, store caching)

## Day 8 — Sun 15 Nov · Buffer only. Deadline 23:59 UTC.

## Credits
- SERV: the $5 starter credit is enough (each claim extraction is one short call; Step 0 + eval + all
  demo runs are well under 100 calls). Nothing else to request.
- Kite: testnet pieUSD comes free from `kpass faucet drop`; no credits needed.
- Reppo / Dolphin partner credits: not our tracks; not needed.

## Not doing (scope guard)
- A token of any kind
- A consumer-app pivot (the human entry point is the "check a seller" page)
- Any feature the 90-second video cannot show
- A global, trust-everyone reputation registry (shared records are opt-in feeds only)
- Refunds or on-chain dispute
- Any chart, any graph drawing, any `gr_` API
- Mainnet, USDC, live card
- Automating the passkey approval
