import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { secp256k1 } from "@noble/curves/secp256k1";
import { canonical, feedDigest, signFeed, verifyFeedSignature, verifyFeedIdentity, kiteKeyAddress, kiteSigningAddresses, splitPin, createKiteDirectory } from "../src/identity.js";
import { createFeedChecker } from "../src/feeds.js";
import { createBuyer } from "../src/buy.js";
import { memoryStore } from "../src/store.js";
import { extractClaims } from "../src/serv.js";
import { buildRecords } from "../src/records.js";
import { feedSignerHTML } from "../web/assets/records-view.js";
import { identityCell, receiptNotesHTML } from "../web/assets/render.js";
import { fakeKpass, fakeServ, HONEST, B_URL, B_ORIGIN } from "./helpers.js";

const KEY = generatePrivateKey(); // a throwaway key generated per run, never a real identity
const ADDR = privateKeyToAccount(KEY).address;
const OTHER = privateKeyToAccount(generatePrivateKey()).address;
const DID = "did:kite:ind-test:tare-records";
const FEED = { version: 1, publisher: "tare", records: [{ origin: "https://bad.test", status: "held", reason: "dispute", since: "T" }] };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
// Kite's format: "secp256k1:<base64 compressed point>"
const kitePub = (pk) => "secp256k1:" + Buffer.from(secp256k1.getPublicKey(pk.slice(2), true)).toString("base64");
const kiteKeys = (keys, did = DID) => async () => json({ data: { agent_id: "agt_x", did, keys } });

test("canonical JSON and the digest ignore key order and the signature block", () => {
  assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
  assert.equal(feedDigest({ a: 1, signature: { x: 1 } }), feedDigest({ a: 1 }));
});

test("a signed feed verifies; any change after signing is caught", async () => {
  const signed = await signFeed(FEED, KEY);
  assert.deepEqual(await verifyFeedSignature(signed), { ok: true, signer: ADDR, reason: null });
  const tampered = structuredClone(signed);
  tampered.records[0].status = "in_good_standing";
  assert.match((await verifyFeedSignature(tampered)).reason, /changed after it was signed/);
  const forged = { ...signed, signature: { ...signed.signature, signer: OTHER } };
  assert.match((await verifyFeedSignature(forged)).reason, /does not match the named signer/);
  assert.match((await verifyFeedSignature(FEED)).reason, /not signed/);
});

test("Kite public keys: the address derived from pub_key matches Kite's own settlement_address", () => {
  // Public data from Kite Passport's directory (did:kite:corp-gokite:support, read 11 Nov 2026).
  assert.equal(kiteKeyAddress("secp256k1:A/eRIj6loQf1boMHAqR63778cNkWAXQzn73DGGmDZSRP"), "0x2C9391d378C4c2b5b8124b6a159C37eEEb9c2247");
  assert.equal(kiteKeyAddress("ed25519:abc"), null);
  assert.equal(kiteKeyAddress(kitePub(KEY)), ADDR);
});

test("only active keys inside their validity window count", async () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  const keys = [
    { pub_key: kitePub(KEY), status: "active", valid_from: "2026-11-10T00:00:00Z", valid_to: null },
    { pub_key: kitePub(generatePrivateKey()), status: "revoked" },
    { pub_key: kitePub(generatePrivateKey()), status: "active", valid_to: "2026-11-11T00:00:00Z" },
  ];
  assert.deepEqual(await kiteSigningAddresses(DID, { fetchImpl: kiteKeys(keys), now }), [ADDR]);
  await assert.rejects(kiteSigningAddresses(DID, { fetchImpl: kiteKeys(keys, "did:kite:ind-x:other") }), /different agent/);
});

test("pinning: by address, by Kite DID, and every way it can fail", async () => {
  const signed = await signFeed(FEED, KEY, { did: DID });
  assert.equal((await verifyFeedIdentity(signed, ADDR)).ok, true);
  assert.match((await verifyFeedIdentity(signed, OTHER)).reason, /not the pinned/);
  const active = kiteKeys([{ pub_key: kitePub(KEY), status: "active" }]);
  const ok = await verifyFeedIdentity(signed, DID, { fetchImpl: active });
  assert.deepEqual([ok.ok, ok.did, ok.signer], [true, DID, ADDR]);
  const notBound = await verifyFeedIdentity(signed, DID, { fetchImpl: kiteKeys([]) });
  assert.match(notBound.reason, /not an active key/);
  const down = await verifyFeedIdentity(signed, DID, { fetchImpl: async () => json({}, 503) });
  assert.match(down.reason, /could not read/);
  assert.deepEqual(splitPin("https://x.test/records.json#did:kite:a:b"), { url: "https://x.test/records.json", pin: "did:kite:a:b" });
});

test("feed checker: a pinned feed is used only if its identity verifies", async () => {
  const signed = await signFeed(FEED, KEY);
  const url = "https://feed.test/records.json";
  const good = await createFeedChecker({ feeds: [`${url}#${ADDR}`], fetchImpl: async () => json(signed) })("https://bad.test");
  assert.equal(good.hold?.reason, "dispute");
  assert.ok(good.notes.some((n) => /signed by .*verified/.test(n)));
  const wrong = await createFeedChecker({ feeds: [`${url}#${OTHER}`], fetchImpl: async () => json(signed) })("https://bad.test");
  assert.equal(wrong.hold, null);
  assert.ok(wrong.notes.some((n) => /ignored: identity not verified/.test(n)));
  const unsigned = await createFeedChecker({ feeds: [`${url}#${ADDR}`], fetchImpl: async () => json(FEED) })("https://bad.test");
  assert.equal(unsigned.hold, null);
  const unpinned = await createFeedChecker({ feeds: [url], fetchImpl: async () => json(signed) })("https://bad.test");
  assert.equal(unpinned.hold?.reason, "dispute");
  assert.ok(unpinned.notes.some((n) => /signer not pinned/.test(n)));
});

test("seller identity: found by origin in Kite's directory, recorded on the receipt and in records", async () => {
  const dir = createKiteDirectory({ fetchImpl: async () => json({ data: [{ did: "did:kite:ind-s:seller-b", uid: "seller-b", kind: "seller", url: B_URL, verified_tier: "unverified" }] }) });
  assert.equal((await dir(B_ORIGIN)).did, "did:kite:ind-s:seller-b");
  assert.equal(await dir("https://elsewhere.test"), null);
  const serv = fakeServ(HONEST);
  const b = createBuyer({ store: memoryStore(), kpass: fakeKpass(), extract: (p) => extractClaims(p, { complete: serv.complete }), promptSha256: "x", findIdentity: dir });
  const r = await b.buy(B_URL);
  assert.equal(r.status, "clean");
  assert.equal(r.seller_identity.did, "did:kite:ind-s:seller-b");
  assert.match(identityCell(r), /did:kite:ind-s:seller-b/);
  const feed = buildRecords({ receipts: [r], blocklist: {} });
  assert.equal(feed.records[0].evidence.seller_identity.did, "did:kite:ind-s:seller-b");
});

test("seller identity: unregistered or unreachable never blocks a buy, and is noted", async () => {
  const serv = fakeServ(HONEST);
  const mk = (findIdentity) => createBuyer({ store: memoryStore(), kpass: fakeKpass(), extract: (p) => extractClaims(p, { complete: serv.complete }), promptSha256: "x", findIdentity });
  const none = await mk(async () => null).buy(B_URL);
  assert.equal(none.status, "clean");
  assert.match(identityCell(none), /not registered/);
  const down = await mk(async () => { throw new Error("HTTP 503"); }).buy(B_URL);
  assert.equal(down.status, "clean");
  assert.match(receiptNotesHTML(down), /Kite directory not read: HTTP 503/);
});

test("check page names the feed's signer, escaped", async () => {
  const signed = await signFeed(FEED, KEY, { did: DID });
  assert.match(feedSignerHTML(signed), new RegExp(DID));
  assert.match(feedSignerHTML(FEED), /not signed/);
});
