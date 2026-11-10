# Tare

**The label is not the delivery.**

Spending policies decide whether an agent may pay. **Tare checks what it got.**

Tare is an independent check of what an x402 data seller delivered. It pays the seller on Kite
testnet, has SERV Reasoning read what the seller promised, counts and checks the delivered rows in
plain code, and keeps an evidence-backed record of every seller that over-promised, so the agent
stops buying from it.

- **Live site:** https://tare-agent.vercel.app (the published run, read-only)
- **Built for:** SERV Hackathon 02, Kite track
- **Network:** Kite testnet only, testnet pieUSD

> Pay per record? Then someone has to count the records.

## Quick start

Requires Node 22 or newer.

```
git clone https://github.com/Ritapossible/Tare && cd Tare
npm ci
npm test                      # 189 tests; SERV and the payment rail are faked, no network
cp .env.example .env          # then set SERV_API_KEY
node scripts/serv_check.mjs   # one real SERV call through the production client
npm run app                   # live console on http://127.0.0.1:4020/app
```

## How it works

1. **Read the advertisement.** Before paying, Tare makes an unpaid request and reads the seller's 402
   advertisement (`resource.description`): the promise made before any money moves.
2. **Pay.** Tare pays 0.001 testnet pieUSD over x402 on Kite testnet, inside hard spending caps, and
   keeps the settlement hash from `PAYMENT-RESPONSE`. It never makes one up.
3. **Read the promise.** SERV Reasoning (`gpt-5.4-mini-serv-multipath`) reads only the seller's own
   words, the advertisement and the delivery note, never the rows. One prompt extracts four claims
   (`claimed_count`, `unique`, `fields`, `no_nulls`). A second prompt reads a time window
   (`max_age_hours`), and runs only when the seller mentions time. Code then drops any claim the
   seller's text does not support: a count must be a number the seller states exactly, not "up to
   20" or "10,000+".
4. **Check.** Code, not SERV, counts rows, distinct ids, fields, empty values and timestamp ages, and
   checks every claim. A failed claim is a **dispute**. A delivery that promises no count is
   **unverifiable**. Either one puts the seller on hold, and the next buy stops before any payment is
   attempted. A broken advertised claim shows as `advertised:<rule>`.
5. **Record.** Each buy becomes a receipt with the settlement hash, the body's sha256, the prompt's
   sha256 and both promises word for word. Seller records can be published for other agents.

With Kite Passport, your agent shops inside a capped, time-limited session and never holds a private
key. Tare checks what it brought home.

Details: [SPEC.md](SPEC.md) (behaviour), [ARCHITECTURE.md](ARCHITECTURE.md) (structure),
[docs/WRITEUP.md](docs/WRITEUP.md) (the hackathon write-up).

## SERV Reasoning

1. Sign in at https://console.openserv.ai and create an API key.
2. Put it in `.env` as `SERV_API_KEY`.
3. The $5 starter credit pays for SERV inference only. It never funds a payment; payments use
   testnet pieUSD.
4. `node scripts/serv_check.mjs` makes one completion with the production client, request and
   parser, and prints the raw content, `finish_reason`, `usage` and the parsed claims. On an error
   it prints it and exits non-zero.

| | |
|---|---|
| Model | `gpt-5.4-mini-serv-multipath`, `reasoning_effort: low`, strict JSON schema, 400-token cap |
| Main prompt sha256 | `7b5d603d7c140d3cf34afc3b525cac2e7ddb4bd001a092f26fa28c89437bec86` |
| Freshness prompt sha256 | `b7089fef4ceba1244340c9c975202a8630356e20298c6d3fa0b81fe59facaa1c` |
| Source | [`src/prompt.js`](src/prompt.js) |

**Live evaluation** (`node scripts/serv_eval.mjs`, 10 Nov 2026): accuracy **9/9** on honest seller
texts, safety **6/6** on injection attempts (no manipulated text got seller A verified).

**SERV platform tools.** Requests declare `serv_disable_content_filter` by default. The default filter
refused plain texts like "Here is your data.", and accuracy was 7/9. SERV's Prompt Guard is
deliberately off: it turns an injection attempt into a SERV failure, so the seller would be paid but
not held. Both were measured; see the write-up.

## Payment rail

Two rails behind one interface, chosen with `TARE_PAYMENT_RAIL`:

- **`kpass`** (default): Kite Passport pays inside a passkey-approved session (0.05 per payment,
  1 in total, 1 hour).
- **`x402-direct`**: Tare signs the standard x402 `exact` payment with a testnet-only key, and the
  Pieverse facilitator settles it on Kite testnet. Tare refuses to sign anything but testnet pieUSD on
  `eip155:2368`, at most 0.05 per payment and 1 in total over the key's lifetime.

**What happened on 10 Nov 2026.** Kite Passport worked up to the payment: account, sandbox mode, a
registered agent and a session the owner approved with a passkey. Then `kpass session execute`
returned `payment_target_forbidden: host_not_in_executable_catalog`, on both Kite's production and dev
backends, because Tare's sellers are not in Kite's service catalog. Kite has been asked to list them.
So the published run used `x402-direct`:

- **Payer (signer):** `0x7979989aD2A57dC6bBf28fFB120b18aC0aB10895`, a testnet-only key held by Tare
- **Payee:** `0x9Ef47eA89403c6a2637271B655b0C5b99c68C447`, the owner's Kite Passport wallet (`PAY_TO`)
- **Settled by:** the Pieverse facilitator, on Kite testnet (chain 2368)
- **Caps:** enforced by Tare's own ledger and the x402 client's spend controls, not by a Passport session

Real Kite testnet settlements from the published run, verified on-chain, 0.001 pieUSD each:

- Seller A, dispute: `0xd7caedba720278dd80e4b7cf2ab94afd20f15e21882b762aab009a04ee69874b`
- Seller B, verified: `0x8e1bf4ab2d38b43d637255e2267e853600ac58d1ff23cc88227531967e449716`

No Passport payment hash exists for this run, and none is shown.

### Kite testnet setup (kpass 6.13.1)

```
curl -fsSL https://cli.gokite.ai/install.sh | bash
kpass signup init --email <you>            # new account (or: kpass login init / login verify)
kpass sandbox on                           # testnet mode
kpass wallet address
kpass agent register --type service-tester
kpass session create --separate --task-summary "tare receipt check" \
  --max-amount-per-tx 0.05 --max-total-amount 1 --assets pieUSD --ttl 1h --no-browser
kpass session execute --method GET --url "<seller url>" --idempotency-key <key> --output json
```

You approve the session with your passkey; Tare never automates that. The production faucet is
disabled in 6.13.1; testnet pieUSD came from the faucet on Kite's dev Passport backend (see
[docs/RUNBOOK.md](docs/RUNBOOK.md)). For the direct rail: `node scripts/x402_wallet.mjs`, fund the
printed address with testnet pieUSD, then run with `TARE_PAYMENT_RAIL=x402-direct`.

## Try it

```
node scripts/reset.mjs   # clean slate (keeps the lifetime spending ledger)
node scripts/buy.mjs a   # seller A from sellers.json
node scripts/buy.mjs a
node scripts/buy.mjs b
```

- Buy seller A. See: 1,240 claimed, 860 unique, dispute (in the delivery and in its 402
  advertisement), a testnet hash, seller A held.
- Buy seller A again. See: stopped, not paid, the payment counter unchanged.
- Buy seller B. See: 200 promised, 200 delivered, verified, a testnet hash.

The same buys work from the console (`npm run app`). Sellers and their deploy steps:
[sellers/README.md](sellers/README.md).

## Seller records: warn other agents

`node scripts/publish.mjs` publishes the local run for the hosted site:

- [`/records.json`](https://tare-agent.vercel.app/records.json): one record per seller, held or in good
  standing, with the evidence (both promises word for word, promised vs delivered, failed checks,
  settlement hash, body hash, prompt hash).
- [`/check`](https://tare-agent.vercel.app/check): look up any seller before paying.
- `/badges/<host>.svg`: a "Verified by Tare" badge, only for sellers verified and in good standing.

Another agent opts in by trusting the feed:

```
TARE_FEEDS=https://tare-agent.vercel.app/records.json node scripts/buy.mjs <seller url>
```

A seller held in a trusted feed is stopped before payment (override per buy with
`--allow-feed-hold`). An unreachable or malformed feed never blocks a buy, and the receipt says what
happened. There is no global blacklist: each operator chooses which feeds to trust.

**Paid lookups.** The feed can be sold over x402 with the same seller template, at 0.001 testnet pieUSD
per lookup ([sellers/README.md](sellers/README.md), "The records feed as a paid service"). An agent
pays for lookups only with `TARE_PAY_FEEDS=1`; the payment uses the same rail and caps as a buy, is
cached for 5 minutes and is noted on the receipt. Tested live on 10 Nov 2026: a fresh agent paid one
lookup (`0x217a85b7ee1563555664308ca6800510efb22a4a403ceb159dad4ee15c8d3d20`, Kite testnet), saw seller A
held, and made no payment to seller A.

## Add Tare to your agent

```js
// npm install github:Ritapossible/Tare   (SERV_API_KEY in the environment)
import { verify, tareFetch } from "tare";
const r = await verify(sellerText, rows);   // { verdict: "clean" | "dispute" | "unverifiable", failed, claims }
const receipt = await tareFetch(sellerUrl);  // pay over x402, check, record; held sellers are refused
```

`verify` never pays: it reads the seller's text with SERV and checks your rows in code. `tareFetch`
is the full buyer, as in the CLI; it keeps its store in `./data/store.json` of the calling process.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `SERV_API_KEY` | (required for checks) | SERV Reasoning API key, in `.env` |
| `TARE_PAYMENT_RAIL` | `kpass` | `kpass` or `x402-direct` |
| `TARE_FEEDS` | none | Comma-separated `records.json` URLs to trust (https only) |
| `TARE_PAY_FEEDS` | off | `1` lets Tare pay feeds that charge per lookup |
| `TARE_SERV_TOOLS` | `disable_content_filter` | SERV platform tools, comma list or `none` |
| `PORT` | `4020` | Port of the local console |

## Scripts

| Command | What it does |
|---|---|
| `npm run app` | Local console with live Buy buttons |
| `node scripts/buy.mjs <a\|b\|url>` | One buy (`--request-id`, `--allow-feed-hold`) |
| `node scripts/reset.mjs` | Clear receipts and holds (keeps the lifetime spending ledger) |
| `node scripts/unblock.mjs <origin>` | Release a held seller after review |
| `node scripts/resolve.mjs` | List or resolve a payment whose outcome is unknown, after checking the explorer |
| `node scripts/publish.mjs` | Write `web/data/state.json`, `web/records.json` and badges for the hosted site |
| `node scripts/seller_probe.mjs <url>…` | Check a seller charges testnet pieUSD 0.001, without paying |
| `node scripts/serv_check.mjs` | One SERV call through the production client |
| `node scripts/serv_eval.mjs` | Live accuracy and injection-safety evaluation |
| `node scripts/real_probe.mjs` | What real x402 sellers promise in their advertisements (no payment) |
| `node scripts/x402_wallet.mjs` | Create or show the testnet-only key for the direct rail |

## Web app

Pages: landing `/`, console `/app`, receipt `/app/receipt`, sellers `/app/sellers`, check a seller
`/check`, docs `/docs`. Static HTML, CSS and ES modules in `web/`, no build step.

**Hosting on Vercel:** import the repo, set **Root Directory** to `web`, Framework Preset **Other**,
no build command. The hosted site is read-only and shows the published run: payments are signed on
the operator's machine, never by the website.

## Tests

```
npm test
```

189 tests with `node --test`. SERV and the payment rail are injected fakes, so tests never touch the
network. Test hashes are obviously fake (`0xTEST…`, `0x7e57…`).

## License

MIT
