# Kite check (Step 0, run by a human)

Run these once, in order, on the machine where Tare will run. The passkey approval is done by you
in the browser/device prompt — it is never automated.

```
kpass sandbox on
kpass wallet address
kpass faucet drop --recipient <address from the previous command> --token pieUSD
kpass agent register --type service-tester
kpass agent session create --task-summary "tare receipt check" --max-amount-per-tx 0.05 --max-total-amount 1 --assets pieUSD --ttl 1h
kpass agent session execute --method GET --url "<seller B url>"
```

Expected from the last command: HTTP 200, the JSON body, and a settlement hash in the
`PAYMENT-RESPONSE` header.

## After running

1. Paste the **full raw output** of the `execute` command into `MEMORY.md` under
   "Facts learned (from running things)" (trim the body rows if long). `src/kpass.js` is written
   against that exact format.
2. Paste the settlement hash into `README.md` under "Testnet settlement hash from seller B".
3. If there is no `PAYMENT-RESPONSE` hash, write "no hash returned" — do not fill one in.
