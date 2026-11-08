# Tare

**The label is not the delivery.**

Tare is a buyer agent that pays data sellers over x402 on Kite testnet, then checks what it got
against what the seller said it sent. If any claim fails, Tare records a dispute and refuses the
next payment to that seller.

> Status: in development for SERV Hackathon 02 (Kite track). Sections marked _TODO_ are filled in
> as the build lands.

## How it works

1. Tare pays a seller with Kite Passport (`kpass`) and receives the body plus a settlement hash.
2. SERV Reasoning (`gpt-5.4-mini-serv-multipath`) reads **only the seller's prose** and extracts
   four claims: `claimed_count`, `unique`, `fields`, `no_nulls`.
3. **Code, not SERV, counts the rows and decides.** Any failed claim ⇒ dispute ⇒ the seller's
   origin is blocklisted, and the next buy is refused before `kpass` is called.

See [SPEC.md](SPEC.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## SERV key

1. Sign in at https://console.openserv.ai and create an API key.
2. `cp .env.example .env` and set `SERV_API_KEY`.
3. The $5 starter credit pays for SERV inference only. It does not fund any payment; payments use
   testnet pieUSD from the Kite faucet.
4. Check it: `node scripts/serv_check.mjs` _(TODO)_

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

## Tests

```
npm test
```

## Try it _(TODO)_

- Do: buy seller A. See: 1240 claimed, 860 unique, verdict dispute, a testnet hash, seller A blocklisted.
- Do: buy seller A again. See: refused, `not paid`, `kpass` never called.
- Do: buy seller B. See: 200 claimed, 200 counted, verdict clean, a testnet hash.

## License

MIT
