// Direct x402 payment rail (fallback while Kite Passport does not allowlist Tare's sellers).
//
// Tare signs the standard x402 "exact" payment (EIP-3009 transferWithAuthorization) with a
// testnet-only key, the seller's own payment middleware verifies it, and the Pieverse
// facilitator settles it on Kite testnet. The settlement hash comes back in PAYMENT-RESPONSE.
//
// Nothing is signed unless ALL of these hold (checked in onBeforePaymentCreation):
//   - network is Kite testnet eip155:2368 and the asset is testnet pieUSD (never mainnet USDC.e)
//   - scheme is "exact"
//   - amount <= the per-payment cap, and spent + amount <= the total cap
// The x402 client's own spend controls are also set to allow only testnet pieUSD, capped.

import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { decodePaymentResponse } from "./kpass.js";

export const KITE_TESTNET = {
  network: "eip155:2368",
  asset: "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A", // pieUSD, 18 decimals
};

const UNIT = 10n ** 18n;
export const DEFAULT_CAPS = {
  perPayment: (5n * UNIT) / 100n, // 0.05 pieUSD
  total: 1n * UNIT, // 1 pieUSD
};

// Returns null when the requirement may be paid, otherwise the reason it may not.
export function checkRequirement(req, { spent, caps = DEFAULT_CAPS }) {
  if (!req || typeof req !== "object") return "no payment requirement";
  if (req.scheme !== "exact") return `scheme ${req.scheme} is not "exact"`;
  if (req.network !== KITE_TESTNET.network) return `network ${req.network} is not Kite testnet ${KITE_TESTNET.network}`;
  if (String(req.asset).toLowerCase() !== KITE_TESTNET.asset.toLowerCase()) return `asset ${req.asset} is not testnet pieUSD`;
  let amount;
  try {
    amount = BigInt(req.amount ?? req.maxAmountRequired);
  } catch {
    return `amount ${req.amount} is not an integer`;
  }
  if (amount <= 0n) return "amount must be positive";
  if (amount > caps.perPayment) return `amount ${amount} exceeds the per-payment cap ${caps.perPayment}`;
  if (spent + amount > caps.total) return `total cap ${caps.total} would be exceeded (spent ${spent})`;
  return null;
}

// ledger = { spent(): bigint, add(units: bigint): void }
export function createX402Direct({ privateKey, ledger, caps = DEFAULT_CAPS, fetchImpl = globalThis.fetch }) {
  if (!privateKey) throw new Error("x402-direct rail needs a testnet private key (scripts/x402_wallet.mjs)");
  const account = privateKeyToAccount(privateKey);

  const client = x402Client.fromConfig({
    schemes: [{ network: KITE_TESTNET.network, client: new ExactEvmScheme(account) }],
    spendControls: {
      allowedAssets: [{ network: KITE_TESTNET.network, asset: KITE_TESTNET.asset, maxAmountPerPayment: caps.perPayment.toString() }],
    },
  });

  let pending = 0n;
  client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
    const reason = checkRequirement(selectedRequirements, { spent: ledger.spent(), caps });
    if (reason) return { abort: true, reason: `Tare refused to sign: ${reason}` };
    pending = BigInt(selectedRequirements.amount ?? selectedRequirements.maxAmountRequired);
  });

  const payFetch = wrapFetchWithPayment(fetchImpl, client);

  return {
    address: account.address,
    async execute(url) {
      pending = 0n;
      const res = await payFetch(url, { method: "GET" });
      const bodyText = await res.text();
      const header = res.headers.get("payment-response");
      const paymentHash = decodePaymentResponse(header);
      // Count the spend once the seller answered 200 to a signed payment, hash or not.
      if (res.status === 200 && pending > 0n) ledger.add(pending);
      const raw = JSON.stringify({ rail: "x402-direct", status: res.status, payment_response: header, body_bytes: bodyText.length });
      return { status: res.status, bodyText, paymentHash, raw };
    },
  };
}
