# Tare

**The label is not the delivery.**

Spending policies decide whether an agent may pay. **Tare checks what it got.** It pays x402 data
sellers on Kite testnet, reads each seller's own promise about its delivery with SERV Reasoning,
verifies that promise against the delivered rows in code, and keeps a record of every seller that
over-promised, so the agent stops buying from it.

> Status: in development for SERV Hackathon 02 (Kite track). Sections marked _TODO_ are filled in
> as the build lands.

## How it works

1. Tare pays a seller with Kite Passport (`kpass`) and receives the body plus a settlement hash.
2. SERV Reasoning (`gpt-5.4-mini-serv-multipath`) reads **only the seller's prose** and extracts
   four claims: `claimed_count`, `unique`, `fields`, `no_nulls`.
3. **Code, not SERV, counts the rows and decides.** Any failed claim ⇒ dispute ⇒ the seller is
   held on its seller record, and the next buy stops before `kpass` is called.

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

## Kite testnet setup

```
kpass sandbox on
kpass wallet address
kpass faucet drop --recipient <address> --token pieUSD
kpass agent register --type service-tester
kpass agent session create --task-summary "tare receipt check" --max-amount-per-tx 0.05 --max-total-amount 1 --assets pieUSD --ttl 1h
kpass agent session execute --method GET --url "<seller url>"
```

Testnet settlement hash from seller B: _not yet run — pasted here only once `kpass` returns it._

## Web app

```
npm run app          # live console on http://127.0.0.1:4020 (Buy works, needs kpass + your passkey)
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
- Do: buy seller A again. See: stopped, `not paid`, `kpass` never called.
- Do: buy seller B. See: 200 promised, 200 delivered, verified, a testnet hash.

## License

MIT
