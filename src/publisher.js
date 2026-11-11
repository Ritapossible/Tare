// The publisher identity that signs records.json.
//   data/publisher.key   secp256k1 private key (gitignored, mode 0600, never printed)
//   publisher.json       public: { "did": "did:kite:…" } once the key is bound to a Kite agent
import { existsSync, readFileSync } from "node:fs";

export const PUBLISHER_KEY_PATH = "data/publisher.key";
export const PUBLISHER_CONFIG_PATH = "publisher.json";

export function loadPublisher({ keyPath = PUBLISHER_KEY_PATH, configPath = PUBLISHER_CONFIG_PATH } = {}) {
  if (!existsSync(keyPath)) return null;
  const privateKey = readFileSync(keyPath, "utf8").trim();
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
  return { privateKey, did: config.did ?? null };
}
