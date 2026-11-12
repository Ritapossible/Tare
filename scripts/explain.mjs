// Add SERV's plain-English explanation to a stored dispute that does not have one yet, without paying
// again. The delivered body is re-read from a file you name, and ONLY if its sha256 equals the
// receipt's body_sha256 (so it is provably the bytes that were delivered); code re-measures the
// details from it, then SERV writes the explanation from those numbers.
//
//   node scripts/explain.mjs <receipt id> --body <file>
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileStore } from "../src/store.js";
import { STORE_PATH, loadEnv } from "../src/tare.js";
import { parseBody, check } from "../src/check.js";
import { createServComplete } from "../src/serv.js";
import { explainReceipt } from "../src/explain.js";

loadEnv();
const [id, flag, file] = process.argv.slice(2);
if (!id || flag !== "--body" || !file) {
  console.error("usage: node scripts/explain.mjs <receipt id> --body <file holding the delivered body>");
  process.exit(2);
}
const store = fileStore(STORE_PATH);
const r = store.receipts().find((x) => x.id === id);
if (!r) { console.error(`no receipt ${id}`); process.exit(1); }
if (r.status !== "dispute" && r.status !== "unverifiable") { console.error(`receipt ${id} is ${r.status}; only disputes are explained`); process.exit(1); }
const bytes = readFileSync(file);
const sha = createHash("sha256").update(bytes).digest("hex");
if (sha !== r.body_sha256) { console.error(`refused: ${file} hashes to ${sha}, not the delivered body ${r.body_sha256}`); process.exit(1); }
const body = parseBody(bytes.toString("utf8"));
const now = Date.parse(r.created_at);
const patch = { details: check(body.rows, r.claims, { now }).details };
if (r.advertised_claims) patch.advertised_details = check(body.rows, r.advertised_claims, { now }).details;
const out = await explainReceipt({ ...r, ...patch }, { complete: createServComplete({ apiKey: process.env.SERV_API_KEY }) });
store.put({ ...r, ...patch, explanation: out.explanation, explanation_notes: [...out.notes, `explained afterwards from the delivered body (sha256 ${sha.slice(0, 12)}… matches the receipt)`] });
console.log(out.explanation ? `explanation: ${out.explanation}` : `no explanation: ${out.notes.join("; ")}`);
