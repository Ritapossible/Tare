# Tare

**The label is not the delivery.**

Spending policies decide whether an agent may pay. **Tare checks what it got.** It pays x402 data
sellers on Kite testnet, reads each seller's own promise about its delivery with SERV Reasoning,
verifies that promise against the delivered rows in code, and keeps a record of every seller that
over-promised, so the agent stops buying from it.

> Status: in development for SERV Hackathon 02 (Kite track). Sections marked _TODO_ are filled in
> as the build lands.

## How it works

1. Tare pays a seller over x402 on Kite testnet and receives the body plus a settlement hash
   (see [Payment rail](#payment-rail): Kite Passport, or a capped testnet key when Passport cannot pay).
2. SERV Reasoning (`gpt-5.4-mini-serv-multipath`) reads **only the seller's prose** and extracts
   four claims: `claimed_count`, `unique`, `fields`, `no_nulls`.
3. **Code, not SERV, counts the rows and decides.** Any failed claim ⇒ dispute ⇒ the seller is
   held on its seller record, and the next buy stops before any payment is attempted.

See [SPEC.md](SPEC.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## SERV key

1. Sign in at https://console.openserv.ai and create an API key.
2. `cp .env.example .env` and set `SERV_API_KEY`.
3. The $5 starter credit pays for SERV inference only. It does not fund any payment; payments use
   testnet pieUSD from the Kite faucet.
4. Check it: `npm install && node scripts/serv_check.mjs`. It makes one completion and prints the raw
   content, `finish_reason` and `usage`, or the error and exits non-zero.

System prompt sha256: `7b5d603d7c140d3cf34afc3b525cac2e7ddb4bd001a092f26fa28c89437bec86`
(source: [`src/prompt.js`](src/prompt.js)).

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

## Try it _(TODO)_

- Do: buy seller A. See: 1240 claimed, 860 unique, verdict dispute, a testnet hash, seller A held.
- Do: buy seller A again. See: stopped, `not paid`, no payment attempted.
- Do: buy seller B. See: 200 promised, 200 delivered, verified, a testnet hash.

## License

MIT
