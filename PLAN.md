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

## Live day — Tue 10 Nov · run `docs/RUNBOOK.md` (🧑), then parser rewrite + first end-to-end run (🤖)

## Day 4 — Wed 11 Nov · UI + review P1 items
- [ ] 🤖 `src/server.js`: one plain page, Buy A / Buy B buttons (request_id at render), receipts table, `kpass calls` counter
- [ ] 🤖 Claims from the 402 `description` (#6) and `count_qualifier` (#7) — if the live run leaves time
- [ ] 🧑 Live run: reset → buy A → buy A → buy B. Check the three rows.

**Gate:** live run produces dispute (real hash), refused (no hash), clean (real hash).

## Day 5 — Thu 12 Nov · Hardening
- [ ] 🤖 Fix whatever the live run surfaced; edge cases (kpass timeout, session expired message)
- [ ] 🤖 Error text in UI is readable (SERV_INVALID, paid_unverified, kpass failed)
- [ ] 🤖 README complete: two sentences, SERV key + $5 credit note, Kite commands, `npm test`, three "do X, see Y", model id, "code, not SERV, counts and decides"

## Day 6 — Fri 13 Nov · Story
- [ ] 🤖 `docs/WRITEUP.md` (how SERV is used; one sentence on a future dispute lookup — not built)
- [ ] 🤖 Draft X post and video script (< 90 s)
- [ ] 🧑 Record the video from a fresh `reset`

## Day 7 — Sat 14 Nov · Submit
- [ ] 🧑 Repo public, video uploaded, X post live
- [ ] 🧑 Submit at https://openserv.typeform.com/submissions02 (Kite track)

## Day 8 — Sun 15 Nov · Buffer only. Deadline 23:59 UTC.

## Not doing (scope guard)
- Shared reputation feed / dispute lookup service (one sentence in the write-up only)
- Refunds or on-chain dispute
- Any chart, any graph drawing, any `gr_` API
- Mainnet, USDC, live card
- Automating the passkey approval
