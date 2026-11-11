// Verifiable identity for seller-record feeds.
//
// A published records.json is signed by its publisher's secp256k1 key (EIP-191 personal_sign over a
// sha256 digest of the feed's canonical JSON). An agent that trusts a feed can pin who must have
// signed it:
//   - an address   https://…/records.json#0xABC…
//   - a Kite DID   https://…/records.json#did:kite:ind-handle:tare-records
// For a DID, the signer must hold one of the agent's ACTIVE keys in Kite Passport's public key set
// (GET /v1/agents/<did>/signingKeys). Addresses are derived from Kite's published public keys here,
// never taken on trust.

import { createHash } from "node:crypto";
import { privateKeyToAccount, publicKeyToAddress } from "viem/accounts";
import { recoverMessageAddress, getAddress } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1";

export const SIGNATURE_SCHEME = "tare-feed-eip191-sha256-v1";
export const KITE_PASSPORT = "https://passport.prod.gokite.ai";

// Stable JSON: object keys sorted at every level, so the same feed always hashes the same.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// The digest covers everything in the feed except the signature block itself.
export function feedDigest(feed) {
  const { signature, ...rest } = feed;
  return createHash("sha256").update(canonical(rest), "utf8").digest("hex");
}

const message = (digest) => `${SIGNATURE_SCHEME}:${digest}`;

export async function signFeed(feed, privateKey, { did = null } = {}) {
  const { signature, ...rest } = feed;
  const account = privateKeyToAccount(privateKey);
  const digest = feedDigest(rest);
  const value = await account.signMessage({ message: message(digest) });
  return { ...rest, signature: { scheme: SIGNATURE_SCHEME, signer: account.address, did, digest, value } };
}

// Checks the signature against the feed's own content. Returns { ok, signer, reason }.
export async function verifyFeedSignature(feed) {
  const sig = feed?.signature;
  if (!sig) return { ok: false, signer: null, reason: "the feed is not signed" };
  if (sig.scheme !== SIGNATURE_SCHEME) return { ok: false, signer: null, reason: `unknown signature scheme ${sig.scheme}` };
  const digest = feedDigest(feed);
  if (digest !== sig.digest) return { ok: false, signer: null, reason: "the feed was changed after it was signed" };
  let recovered;
  try {
    recovered = await recoverMessageAddress({ message: message(digest), signature: sig.value });
  } catch {
    return { ok: false, signer: null, reason: "the signature is malformed" };
  }
  if (getAddress(recovered) !== getAddress(sig.signer)) return { ok: false, signer: recovered, reason: "the signature does not match the named signer" };
  return { ok: true, signer: getAddress(recovered), reason: null };
}

// Kite publishes keys as "secp256k1:<base64 compressed point>".
export function kiteKeyAddress(pubKey) {
  const m = /^secp256k1:(.+)$/.exec(String(pubKey ?? ""));
  if (!m) return null;
  try {
    const point = secp256k1.ProjectivePoint.fromHex(Buffer.from(m[1], "base64").toString("hex"));
    return publicKeyToAddress(`0x${point.toHex(false)}`);
  } catch {
    return null;
  }
}

// Active signing addresses of a Kite agent, from Kite Passport's public key set.
export async function kiteSigningAddresses(did, { fetchImpl = globalThis.fetch, base = KITE_PASSPORT, now = Date.now(), timeoutMs = 10_000 } = {}) {
  const res = await fetchImpl(`${base}/v1/agents/${encodeURIComponent(did)}/signingKeys`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Kite key lookup HTTP ${res.status}`);
  const body = await res.json();
  if (body?.data?.did !== did) throw new Error("Kite returned a different agent");
  const inWindow = (k) => (!k.valid_from || Date.parse(k.valid_from) <= now) && (!k.valid_to || Date.parse(k.valid_to) > now);
  return (body.data.keys ?? []).filter((k) => k.status === "active" && inWindow(k)).map((k) => kiteKeyAddress(k.pub_key)).filter(Boolean);
}

// "url#0x…" or "url#did:kite:…" → { url, pin }; a bare url has no pin.
export function splitPin(entry) {
  const i = entry.indexOf("#");
  if (i < 0) return { url: entry, pin: null };
  return { url: entry.slice(0, i), pin: entry.slice(i + 1) || null };
}

// Is this feed signed by the pinned identity? Returns { ok, signer, did, reason }.
export async function verifyFeedIdentity(feed, pin, opts = {}) {
  const sig = await verifyFeedSignature(feed);
  if (!sig.ok) return { ...sig, did: null };
  if (!pin) return { ok: true, signer: sig.signer, did: null, reason: null, pinned: false };
  if (/^0x[0-9a-fA-F]{40}$/.test(pin)) {
    return getAddress(pin) === sig.signer
      ? { ok: true, signer: sig.signer, did: null, reason: null, pinned: true }
      : { ok: false, signer: sig.signer, did: null, reason: `signed by ${sig.signer}, not the pinned ${getAddress(pin)}` };
  }
  if (pin.startsWith("did:kite:")) {
    let addresses;
    try {
      addresses = await kiteSigningAddresses(pin, opts);
    } catch (err) {
      return { ok: false, signer: sig.signer, did: pin, reason: `could not read ${pin}'s keys from Kite: ${err.message}` };
    }
    return addresses.some((a) => getAddress(a) === sig.signer)
      ? { ok: true, signer: sig.signer, did: pin, reason: null, pinned: true }
      : { ok: false, signer: sig.signer, did: pin, reason: `${sig.signer} is not an active key of ${pin} in Kite Passport` };
  }
  return { ok: false, signer: sig.signer, did: null, reason: `unknown pin "${pin}" (use 0x… or did:kite:…)` };
}

// Seller identity: is this seller origin registered as an agent in Kite Passport's public directory?
// Returns a finder(origin) → { did, uid, kind, verified_tier, name } | null. The directory is read
// at most once per cacheMs. Lookup problems throw; the buyer notes them and never blocks on them.
export function createKiteDirectory({ fetchImpl = globalThis.fetch, base = KITE_PASSPORT, cacheMs = 10 * 60_000, now = Date.now, timeoutMs = 10_000, pageSize = 200, maxPages = 10 } = {}) {
  let cache = null; // { at, agents }
  async function load() {
    if (cache && now() - cache.at < cacheMs) return cache.agents;
    const agents = [];
    for (let page = 0; page < maxPages; page++) {
      const res = await fetchImpl(`${base}/v1/agents:search?limit=${pageSize}&offset=${page * pageSize}`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`Kite directory HTTP ${res.status}`);
      const batch = (await res.json())?.data ?? [];
      agents.push(...batch);
      if (batch.length < pageSize) break;
    }
    cache = { at: now(), agents };
    return agents;
  }
  return async function findByOrigin(origin) {
    const agents = await load();
    const hit = agents.find((a) => {
      try {
        return new URL(a.url).origin === origin;
      } catch {
        return false;
      }
    });
    return hit ? { did: hit.did, uid: hit.uid, name: hit.name ?? null, kind: hit.kind ?? null, verified_tier: hit.verified_tier ?? null } : null;
  };
}
