// Tare's publisher identity: the key that signs the published records.json.
//
//   node scripts/identity.mjs                 # create data/publisher.key if missing; print its address
//   node scripts/identity.mjs --did <did>     # record the Kite agent DID this key is bound to
//
// The key never leaves data/ (gitignored, mode 0600) and is never printed. To make it a Kite identity:
//   kpass identifier claim                    # once per account (permanent)
//   kpass onboarding submit --type kyc ...    # once per account
//   kpass agent create --uid tare-records --kind seller --url https://tare-agent.vercel.app/records.json
//   kpass agent init --import-key data/publisher.key --key-file <runtime key path>
//   kpass agent token create --agent tare-records
//   kpass agent bind --agent tare-records --token <art_…> --key-file <runtime key path>
// then: node scripts/identity.mjs --did <the agent's did:kite:…>, and publish again.
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { PUBLISHER_KEY_PATH, PUBLISHER_CONFIG_PATH } from "../src/publisher.js";
import { kiteSigningAddresses } from "../src/identity.js";

if (!existsSync(PUBLISHER_KEY_PATH)) {
  mkdirSync(dirname(PUBLISHER_KEY_PATH), { recursive: true });
  writeFileSync(PUBLISHER_KEY_PATH, generatePrivateKey() + "\n", { mode: 0o600 });
  chmodSync(PUBLISHER_KEY_PATH, 0o600);
  console.log(`created ${PUBLISHER_KEY_PATH}`);
}
const address = privateKeyToAccount(readFileSync(PUBLISHER_KEY_PATH, "utf8").trim()).address;
console.log(`publisher address: ${address}`);

const i = process.argv.indexOf("--did");
if (i > 0) {
  const did = process.argv[i + 1];
  if (!/^did:kite:[a-z0-9_-]+:[a-z0-9_-]+$/i.test(did ?? "")) {
    console.error("--did needs a Kite agent DID, e.g. did:kite:ind-yourhandle:tare-records");
    process.exit(2);
  }
  const keys = await kiteSigningAddresses(did);
  if (!keys.includes(address)) {
    console.error(`${address} is not an active key of ${did} in Kite Passport yet (active keys: ${keys.join(", ") || "none"}). Bind it first.`);
    process.exit(1);
  }
  writeFileSync(PUBLISHER_CONFIG_PATH, JSON.stringify({ did }, null, 2) + "\n");
  console.log(`${did} lists this key as active. Saved to ${PUBLISHER_CONFIG_PATH}; run node scripts/publish.mjs.`);
}
const config = existsSync(PUBLISHER_CONFIG_PATH) ? JSON.parse(readFileSync(PUBLISHER_CONFIG_PATH, "utf8")) : {};
console.log(`Kite identity: ${config.did ?? "not linked yet"}`);
