# Tare — Plan

Today: Sun 8 Nov 2026. Deadline: Sun 15 Nov 2026, 23:59 UTC.
**Target submission: Sat 14 Nov.** Sunday is buffer only.

Legend: 🧑 = the human must do it (keys, passkey, deploy accounts, video). 🤖 = code.

## Day 1 — Sun 8 Nov · Foundation + Step 0
- [x] 🤖 Docs: SPEC, ARCHITECTURE, PLAN, MEMORY, CLAUDE.md, README skeleton, LICENSE, .env.example
- [x] 🤖 `package.json` (Node 22, ESM, `npm test` = `node --test`), `src/prompt.js` (+ 6 tests)
- [x] 🤖 `scripts/serv_check.mjs` (error path verified: 401 on a bad key, exit 1)
- [ ] 🧑 Create SERV key at https://console.openserv.ai, put it in `.env`, run `node scripts/serv_check.mjs`
- [ ] 🤖 Record in MEMORY.md: token-cap param, `finish_reason`, raw output shape
- [ ] 🧑 Install `kpass`, run the first five commands in `scripts/kite_check.md` (sandbox, wallet, faucet, register, session)

**Gate:** serv_check prints valid claims JSON. If it fails, stop and fix before anything else.

## Day 2 — Mon 9 Nov · Sellers live
- [x] 🤖 `sellers/generate.mjs` → `sellers/data/a.json`, `b.json` (deterministic, asserted counts, drift test)
- [x] 🤖 `sellers/README.md`: deploy steps for the Kite Express template, twice
- [x] 🤖 `sellers/wrapper/`: unchanged template copy; ran locally on testnet, 402 challenge verified
- [x] 🤖 `scripts/seller_probe.mjs`: no-payment check that a seller charges testnet pieUSD 0.001 on distinct origins
- [ ] 🧑 Create a seller wallet (PAY_TO), deploy seller A and seller B as two services on two hosts
- [ ] 🧑 `node scripts/seller_probe.mjs <A url> <B url>` → both `RESULT : ok`
- [ ] 🧑 `kpass agent session execute --method GET --url <seller B>` → copy the raw output and the hash
- [ ] 🤖 Record real kpass output format in MEMORY.md; fill `sellers.json` (placeholder committed with nulls)

**Gate:** one real testnet hash from seller B exists and is pasted in the README.

## Day 3 — done early on Mon 9 Nov · Core logic + tests
- [x] 🤖 `check.js` + tests (shape, count, unique, fields, no_nulls, fail-closed `unverifiable`)
- [x] 🤖 `serv.js` parse rule + retry + tests (string count, extra verdict, invalid ×2, API error)
- [x] 🤖 `store.js` (atomic JSON, kpass call counter)
- [~] 🤖 `kpass.js`: spawn + provisional parser done; **rewrite parser against real output after the live run**
- [x] 🤖 `buy.js` payment order + all 10 spec tests + P0 fixes (queue, pending lock, replay-first); mutation-checked
- [x] 🤖 `config.js` distinct-origin assertion + test
- [x] 🤖 CLI: `scripts/buy.mjs`, `reset.mjs`, `unblock.mjs`; live eval `scripts/serv_eval.mjs`; CI workflow; `docs/RUNBOOK.md`

**Gate:** `npm test` green, all 10 spec tests present by name.

## Before Tue (🧑, 5 min) · OpenServ account checks (from the organisers' reminder email)
- [ ] 🧑 Confirm the $5 SERV credit is **redeemed** and shows in the balance at https://console.openserv.ai (credit redemption section)
- [ ] 🧑 Enable **data collection** in org settings: https://console.openserv.ai/settings/organization
- [x] 🧑 Vercel deploy: live at https://tare-agent.vercel.app (root `web/`)

## Live day — Tue 10 Nov · run `docs/RUNBOOK.md` (🧑), then parser rewrite + first end-to-end run (🤖)
- [ ] 🧑 Steps 1-6 of the runbook; paste outputs back
- [ ] 🤖 Rewrite `src/kpass.js` parser against the real output; record facts in MEMORY.md
- [ ] 🧑 Live run: reset → buy A → buy A → buy B

**Gate (decides whether Wed builds shared records):** dispute with a real hash, stopped with no hash
and kpass not called, verified with a real hash.

## Day 4 — Wed 11 Nov · Shared seller records (only if Tuesday's gate passed)
Tare warns other agents about sellers that did not deliver what they promised.
- [ ] 🤖 Publish held sellers as a public feed `web/records.json`: one entry per held origin with its
      evidence (promised vs delivered, failed checks, settlement hash, body sha256, prompt sha256, time)
- [ ] 🤖 Before each buy, read the feeds the operator chooses to trust (`TARE_FEEDS`); a seller held
      in a trusted feed is **warned** and stopped before kpass until a human allows it
- [ ] 🤖 `/records` page on the site: held sellers and their evidence
- [ ] 🤖 Tests: trusted feed hit stops before kpass; untrusted or unreachable feed never blocks a buy
      silently (the receipt says what happened); malformed feed entries are ignored; feed contains no
      hash that kpass did not return
- [ ] 🤖 Write-up limits: only feeds you choose to trust (no global blacklist), evidence on every
      record, records are per origin (a seller can move domain; Kite agent identity is the next step)
- [ ] 🤖 If time: claims from the 402 `description` (#6) and `count_qualifier` (#7)

## Day 5 — Thu 12 Nov · Hardening + story
- [ ] 🤖 Fix whatever the live run surfaced; edge cases (kpass timeout, session expired message)
- [ ] 🤖 Error text in UI is readable (SERV_INVALID, paid_unverified, kpass failed)
- [ ] 🤖 README complete: two sentences, SERV key + $5 credit note, Kite commands, `npm test`, three "do X, see Y", model id, "code, not SERV, counts and decides"
- [ ] 🤖 `docs/WRITEUP.md`: what Tare does, how SERV Reasoning powers it, which track (Kite), what was built during the hackathon, live `serv_eval` numbers, shared records and their limits
- [ ] 🤖 Draft X post (tags **@openservai**) and video script (< 90 s)

## Day 6 — Fri 13 Nov · Record + stretch
- [ ] 🧑 Record the video from a fresh `reset` (A dispute → A stopped → B verified → the record warns another agent)
- [ ] 🤖 Stretch, only if all of the above is done: serve the records feed behind x402 with the same Kite seller template (0.001 pieUSD per lookup) as the revenue story

## Day 7 — Sat 14 Nov · Submit
- [ ] 🧑 Repo public, video uploaded
- [ ] 🧑 X post live and tagging **@openservai** (link goes in the form)
- [ ] 🧑 Re-check data collection is enabled in OpenServ org settings
- [ ] 🧑 Submit at https://openserv.typeform.com/submissions02 (Kite track)

## Day 8 — Sun 15 Nov · Buffer only. Deadline 23:59 UTC.

## Credits
- SERV: the $5 starter credit is enough (each claim extraction is one short call; Step 0 + eval + all
  demo runs are well under 100 calls). Nothing else to request.
- Kite: testnet pieUSD comes free from `kpass faucet drop`; no credits needed.
- Reppo / Dolphin partner credits: not our tracks; not needed.

## Not doing (scope guard)
- A global, trust-everyone reputation registry (shared records are opt-in feeds only)
- Refunds or on-chain dispute
- Any chart, any graph drawing, any `gr_` API
- Mainnet, USDC, live card
- Automating the passkey approval
