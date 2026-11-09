// Probe a deployed seller WITHOUT paying. Checks /healthz and decodes the 402 PAYMENT-REQUIRED
// challenge, then fails loudly unless the seller charges testnet pieUSD at 0.001.
//
// The Kite template defaults KITE_NETWORK to mainnet when the variable is unset, so run this
// against every seller before pointing kpass at it.
//
//   node scripts/seller_probe.mjs <seller url> [<seller url> …]

const EXPECT = {
  network: "eip155:2368",
  asset: "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A",
  amount: "1000000000000000", // 0.001 pieUSD at 18 decimals
  extra: { name: "pieUSD", version: "1" },
};

async function probe(url) {
  const u = new URL(url);
  const problems = [];
  console.log(`\n== ${url}`);
  console.log(`origin : ${u.origin}`);

  const health = await fetch(new URL("/healthz", u.origin), { signal: AbortSignal.timeout(90_000) });
  const healthBody = await health.text();
  console.log(`healthz: ${health.status} ${healthBody}`);

  const res = await fetch(u, { signal: AbortSignal.timeout(90_000) });
  console.log(`GET    : ${res.status} (expected 402)`);
  if (res.status !== 402) problems.push(`expected 402, got ${res.status}`);

  const header = res.headers.get("payment-required");
  if (!header) {
    problems.push("no PAYMENT-REQUIRED header");
  } else {
    const challenge = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    const offer = challenge.accepts?.[0] ?? {};
    console.log(`offer  : ${JSON.stringify(offer)}`);
    for (const key of ["network", "asset", "amount"]) {
      if (offer[key] !== EXPECT[key]) problems.push(`${key} is ${offer[key]}, expected ${EXPECT[key]}`);
    }
    if (offer.extra?.name !== EXPECT.extra.name || offer.extra?.version !== EXPECT.extra.version) {
      problems.push(`EIP-712 domain is ${JSON.stringify(offer.extra)}, expected ${JSON.stringify(EXPECT.extra)}`);
    }
  }

  if (problems.length) {
    console.log("RESULT : NOT SAFE TO PAY");
    for (const p of problems) console.log(`  - ${p}`);
    return false;
  }
  console.log("RESULT : ok — testnet pieUSD, 0.001 per call");
  return true;
}

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error("usage: node scripts/seller_probe.mjs <seller url> [<seller url> …]");
  process.exit(2);
}

let ok = true;
for (const url of urls) {
  try {
    ok = (await probe(url)) && ok;
  } catch (err) {
    console.log(`RESULT : probe failed — ${err.message}`);
    ok = false;
  }
}
if (urls.length > 1) {
  const origins = new Set(urls.map((x) => new URL(x).origin));
  if (origins.size !== urls.length) {
    console.log("\nSellers share an origin. Seller records are keyed by origin, so holding one seller would hold both.");
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
