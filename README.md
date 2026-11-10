# Tare

**The label is not the delivery.**

Spending policies decide whether an agent may pay. **Tare checks what it got.** Tare is an independent check
of what an x402 data seller delivered. It pays x402 data
sellers on Kite testnet, reads each seller's own promise about its delivery with SERV Reasoning,
verifies that promise against the delivered rows in code, and keeps a record of every seller that
over-promised, so the agent stops buying from it.

> Built for SERV Hackathon 02 (Kite track). Pay per record? Then someone has to count the records.

## How it works

1. Tare pays a seller over x402 on Kite testnet and receives the body plus a settlement hash
   (see [Payment rail](#payment-rail): Kite Passport, or a capped testnet key when Passport cannot pay).
   Before paying, Tare reads the seller's 402 advertisement (`resource.description`), the promise made
   before any money moves.
2. SERV Reasoning (`gpt-5.4-mini-serv-multipath`) reads **only the seller's own words** (the 402
   advertisement and the delivery note, never the rows) and extracts four claims: `claimed_count`,
   `unique`, `fields`, `no_nulls`. A second, separate prompt reads a time window (`max_age_hours`) only
   when the seller mentions time. Code drops a `fields` claim the text does not support.
3. **Code, not SERV, counts the rows and decides.** It counts rows, distinct ids, fields, empty values
   and timestamp ages. Any failed claim ⇒ dispute ⇒ the seller is held on its seller record, and the
   next buy stops before any payment is attempted. A broken advertised claim shows as
   `advertised:<rule>`. Both promises are kept word for word on the receipt.

With Kite Passport, your agent shops inside a capped, time-limited session and never holds a private
key. Tare checks what it brought home.

See [SPEC.md](SPEC.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## SERV key

1. Sign in at https://console.openserv.ai and create an API key.
2. `cp .env.example .env` and set `SERV_API_KEY`.
3. The $5 starter credit pays for SERV inference only. It does not fund any payment; payments use
   testnet pieUSD from the Kite faucet.
4. Check it: `npm install && node scripts/serv_check.mjs`. It makes one completion and prints the raw
   content, `finish_reason` and `usage`, or the error and exits non-zero.

System prompt sha256: `7b5d603d7c140d3cf34afc3b525cac2e7ddb4bd001a092f26fa28c89437bec86`;
freshness prompt sha256: `b7089fef4ceba1244340c9c975202a8630356e20298c6d3fa0b81fe59facaa1c`
(source: [`src/prompt.js`](src/prompt.js)). Live eval (`node scripts/serv_eval.mjs`, 10 Nov):
accuracy 8/9 on honest texts, safety 6/6 on injection attempts (no manipulated text got seller A
verified). The one miss: SERV refused the text "Here is your data.", which Tare records as paid but
unchecked.

## Payment rail

Tare has two payment rails behind one interface, chosen by `TARE_PAYMENT_RAIL`:

- **`kpass`** (default): Kite Passport pays inside a passkey-approved session (0.05 per payment,
  1 in total, 1 hour).
- **`x402-direct`**: Tare signs the standard x402 `exact` payment with a testnet-only key, and the
  Pieverse facilitator settles it on Kite testnet. Tare refuses to sign anything but testnet pieUSD on
  `eip155:2368`, at most 0.05 per payment and 1 in total.

**What happened on 10 Nov 2026.** Kite Passport worked up to the payment: account, sandbox mode, a
registered agent and a session the owner approved with a passkey. Then `kpass session execute`
returned `payment_target_forbidden: host_not_in_executable_catalog`, on both Kite's production and dev
backends, because Tare's sellers are not in Kite's service catalog. Kite has been asked to allowlist
them. So the published run used `x402-direct`:

- **Payer (signer):** `0x7979989aD2A57dC6bBf28fFB120b18aC0aB10895`, a testnet-only key held by Tare
- **Payee:** `0x9Ef47eA89403c6a2637271B655b0C5b99c68C447`, the owner's Kite Passport wallet (`PAY_TO`)
- **Settled by:** the Pieverse facilitator, on Kite testnet (chain 2368)
- **Caps:** enforced by Tare's own ledger and the x402 client's spend controls, not by a Passport session

Real Kite testnet settlements from the published run (verified on-chain, 0.001 pieUSD each):

- Seller A (dispute): `0xa239ac6d39c87ccda06a6fbe6458b162fa51eec3e75a34c648075e631803d79c`
- Seller B (verified): `0x3f4740410068026e4d568bb5fcff98e8f1298e37bfb899ef1df1534e0a253219`

No Passport payment hash exists for this run, and none is shown.

## Kite testnet setup (kpass 6.13.1)

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

The production faucet is disabled in 6.13.1; testnet pieUSD came from the faucet on Kite's dev
Passport backend (see `docs/RUNBOOK.md`). For the direct rail: `node scripts/x402_wallet.mjs`, fund the
printed address with testnet pieUSD, then run with `TARE_PAYMENT_RAIL=x402-direct`.

## Seller records: warn other agents

Every check becomes part of a public **seller record**. `node scripts/publish.mjs` writes:

- [`/records.json`](https://tare-agent.vercel.app/records.json): one record per seller, held or in good
  standing, with the evidence (promised vs delivered, failed checks, settlement hash, body hash).
- [`/check`](https://tare-agent.vercel.app/check): look up any seller before paying.
- `/badges/<host>.svg`: a "Verified by Tare" badge, only for sellers verified and in good standing.

Another agent opts in by trusting the feed:

```
TARE_FEEDS=https://tare-agent.vercel.app/records.json node scripts/buy.mjs <seller url>
```

A seller held in a trusted feed is stopped before payment (override per buy with
`--allow-feed-hold`). An unreachable or malformed feed never blocks a buy and is noted on the receipt.
There is no global blacklist: agents choose which publishers to trust.

## Web app

```
npm run app          # live console on http://127.0.0.1:4020 (Buy works with the chosen payment rail)
npm run publish:site # copy the local run to web/data/state.json for the hosted, read-only site
```

Pages: landing `/`, console `/app`, receipt detail `/app/receipt`, sellers `/app/sellers`, docs `/docs`.

**Deploy to Vercel:** import `Ritapossible/Tare`, set **Root Directory** to `web`, Framework Preset
**Other**, no build command. The hosted site is read-only: it shows the published run, because
payments need a human passkey on the operator's machine.

## Tests

```
npm test
```

SERV and the payment rail are injected fakes in tests; `npm test` never touches the network.

## Try it

```
npm run app   # then use the console at http://127.0.0.1:4020, or the CLI:
node scripts/reset.mjs
node scripts/buy.mjs <seller A url>
node scripts/buy.mjs <seller A url>
node scripts/buy.mjs <seller B url>
```

- Do: buy seller A. See: 1240 claimed, 860 unique, verdict dispute, a testnet hash, seller A held.
- Do: buy seller A again. See: stopped, `not paid`, no payment attempted.
- Do: buy seller B. See: 200 promised, 200 delivered, verified, a testnet hash.

## License

MIT
