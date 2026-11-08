# Tare — instructions for coding agents

Read `SPEC.md` (behaviour), `ARCHITECTURE.md` (structure), `PLAN.md` (what's next) and
`MEMORY.md` (decisions + status) before changing anything. When you make a decision or learn a
fact by running something, add it to `MEMORY.md`. When you finish a plan item, tick it in `PLAN.md`.

## Non-negotiable rules

1. **SERV never decides.** It only returns the four claims. Never ask the model for allow/dispute,
   never read any field except `claimed_count`, `unique`, `fields`, `no_nulls`.
2. **The rows never go to SERV.** Only the prose, wrapped in `<prose>` tags.
3. **Never invent a transaction hash.** Not in code, tests fixtures shown in the UI, README, docs or
   video. Test fixtures use obviously fake values like `0xTEST…` and never reach the live store.
   If `PAYMENT-RESPONSE` is missing, the hash is `null`.
4. **Blocklist key = seller origin** (`new URL(url).origin`), never a model-returned name.
5. **A blocklisted origin never reaches `kpass`.**
6. **Never automate the passkey approval.**
7. **Testnet only.** No mainnet, no USDC, no live card. Never write "mainnet" in user-facing copy.
8. No graph drawing, no chart, no `gr_` / graph-sharding API calls.
9. Do not build the reputation feed / dispute lookup. Scope guard is in `PLAN.md`.
10. Do not include any AI model identifier in commits, code comments or docs other than the SERV
    model id `gpt-5.4-mini-serv-multipath`.

## Conventions

- Node 22, ESM (`"type": "module"`), no TypeScript in the buyer.
- Tests: `npm test` (`node --test`). SERV and kpass are injected fakes; tests never hit the network.
- `kpass` is spawned with an argv array, never through a shell.
- `.env` holds `SERV_API_KEY` only and is gitignored. `/data/` (the root store dir only) is gitignored; `sellers/data/` is committed.
- Keep dependencies minimal (`openai` only, unless MEMORY.md records why another is needed).
