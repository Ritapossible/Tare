# TypeScript + Express template

A ready-to-deploy reverse proxy that charges x402 payments on the Kite chain
for every request under `/v1/*` and forwards paid requests to `UPSTREAM_URL`.

```bash
npm install
cp .env.example .env        # fill PAY_TO, UPSTREAM_URL, PRICE_USD
set -a && source .env && set +a
npm run dev
curl -i "localhost:8080/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m"
# HTTP/1.1 402 Payment Required + PAYMENT-REQUIRED header
```

Files:

- `src/index.ts` — configuration, routes, proxy. Edit this.
- `src/kite.ts` — Kite network constants and the `$0.001`-style price parser. Leave as is.

The payment middleware verifies the signature before your upstream is called and
settles only when the upstream responded with a status below 400, so a failed
upstream call never charges the buyer.

See the repository [README](../../README.md) for the full flow and how to test
with a Kite Passport agent.
