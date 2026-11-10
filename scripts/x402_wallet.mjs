// Testnet-only wallet for the x402-direct payment rail.
//
//   node scripts/x402_wallet.mjs            # create data/x402-testnet.key if missing; print address + balance
//
// The key file lives in /data/ (gitignored), mode 0600, and is never printed. Fund the address with
// testnet pieUSD only (see docs/RUNBOOK.md). It must never hold real funds.
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { X402_KEY_PATH } from "../src/tare.js";
import { KITE_TESTNET } from "../src/x402direct.js";

if (!existsSync(X402_KEY_PATH)) {
  mkdirSync(dirname(X402_KEY_PATH), { recursive: true });
  writeFileSync(X402_KEY_PATH, generatePrivateKey() + "\n", { mode: 0o600 });
  console.log(`created ${X402_KEY_PATH} (mode 0600, gitignored)`);
}
chmodSync(X402_KEY_PATH, 0o600);
const account = privateKeyToAccount(readFileSync(X402_KEY_PATH, "utf8").trim());
console.log(`address : ${account.address}`);

const data = "0x70a08231" + account.address.slice(2).toLowerCase().padStart(64, "0");
try {
  const r = await fetch("https://rpc-testnet.gokite.ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: KITE_TESTNET.asset, data }, "latest"] }),
  });
  const { result } = await r.json();
  console.log(`balance : ${Number(BigInt(result)) / 1e18} pieUSD on Kite testnet (${KITE_TESTNET.network})`);
} catch (err) {
  console.log(`balance : unavailable (${err.message})`);
}
