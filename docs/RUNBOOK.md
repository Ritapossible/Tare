# Runbook — Tue 10 Nov (live day)

Run on your own laptop, top to bottom. Each step says what to paste back. **Stop at any step marked
GATE if it fails** and paste the output instead of continuing.

Nothing here invents a hash. If a command does not print a transaction hash, write "no hash returned".

## 0. Get the code (2 min)

```
git clone -b ccr-aaaa0a55-l7co6h https://github.com/Ritapossible/tare && cd tare
# or, if already cloned:  git pull
npm ci
cp .env.example .env        # paste your SERV_API_KEY into .env
npm test                    # expect: fail 0
```

## 1. SERV smoke test — GATE (2 min)

```
node scripts/serv_check.mjs
```

- If it fails with a 400 that mentions `max_completion_tokens`, run
  `SERV_CAP_PARAM=max_tokens node scripts/serv_check.mjs --cap-param=max_tokens`
  and use `SERV_CAP_PARAM=max_tokens` in front of every later command.
- If `finish_reason` is `length` and content is empty, stop and paste.

**Paste back:** the whole output.

## 2. SERV eval (3 min, ~12 calls, cents of credit)

```
node scripts/serv_eval.mjs
```

**Paste back:** the whole output. This becomes a real number in the write-up.

## 3. Kite Passport setup (10 min)

```
kpass --version
kpass sandbox on
kpass wallet address
kpass faucet drop --recipient <address from above> --token pieUSD
kpass agent register --type service-tester
kpass agent session create --task-summary "tare receipt check" --max-amount-per-tx 0.05 --max-total-amount 1 --assets pieUSD --ttl 1h
kpass agent session execute --help
```

You approve the passkey yourself. **Paste back:** every output, especially `execute --help`
(we need to know if it has a `--json` or "show headers" flag).

## 4. Deploy the two sellers (20–30 min)

Follow `sellers/README.md` exactly: two Render web services, root directory `sellers/wrapper`,
`KITE_NETWORK=testnet`. Then put both buyer URLs in `sellers.json`:

```json
{
  "a": "https://<seller-a-host>/v1/Ritapossible/tare/2303e9e8a14d7801369977668f6067fb5b49ef17/sellers/data/a.json",
  "b": "https://<seller-b-host>/v1/Ritapossible/tare/2303e9e8a14d7801369977668f6067fb5b49ef17/sellers/data/b.json"
}
```

## 5. Probe the sellers — GATE (1 min, no money moves)

```
node scripts/seller_probe.mjs "$(node -p 'require("./sellers.json").a')" "$(node -p 'require("./sellers.json").b')"
npm test   # the sellers.json test now runs instead of skipping
```

Both sellers must print `RESULT : ok — testnet pieUSD, 0.001 per call`.
**Paste back:** the output and the two URLs.

## 6. First real payment, by hand — GATE (2 min)

```
kpass agent session execute --method GET --url "$(node -p 'require("./sellers.json").b')" > kpass_b_stdout.txt
cat kpass_b_stdout.txt
```

(stdout goes to the file; any prompt still shows on screen.) If `execute --help` showed a `--json`
or headers flag, run it a second time with that flag and save that output too.

**Paste back:** the full contents of `kpass_b_stdout.txt` (trim the rows if long, keep every header
line). Put the settlement hash in `README.md` under "Testnet settlement hash from seller B".

## 7. Stop here and send everything

`src/kpass.js` currently has a **provisional** parser. After step 6 it gets rewritten against the
real output, and only then do we run Tare end to end:

```
node scripts/reset.mjs
node scripts/buy.mjs a     # expect: dispute, real hash, blocked
node scripts/buy.mjs a     # expect: refused, not paid, kpass calls unchanged
node scripts/buy.mjs b     # expect: clean, real hash
```

If you want to try it before the parser update anyway: it cannot fake a hash. The worst case is
`paid_unverified` (it paid 0.001 testnet pieUSD but could not read the hash), and the raw output is
saved to `data/kpass_raw.log`. Paste that file too.

## Before any demo or recording

```
curl https://<seller-a-host>/healthz ; curl https://<seller-b-host>/healthz   # wake Render
node scripts/reset.mjs
```
