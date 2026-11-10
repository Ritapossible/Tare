// Step 0: one SERV completion through the same client, request and parser that production uses.
// Prints the raw content, finish_reason, usage and the parsed claims. On auth, balance or model
// errors it prints the error and exits non-zero. Do not build on top of SERV until this passes.
//
// Usage:
//   node scripts/serv_check.mjs
//   node scripts/serv_check.mjs --cap-param=max_tokens
//   node scripts/serv_check.mjs --prose="Delivered two hundred records."

import { SERV_MODEL, SERV_MAX_OUTPUT_TOKENS, SERV_CAP_PARAM, PROMPT_SHA256, buildMessages } from "../src/prompt.js";
import { createServComplete, parseServTools, parseClaims, ground } from "../src/serv.js";
import { loadEnv } from "../src/tare.js";

const DEFAULT_PROSE = "Delivered one thousand two hundred forty unique records, fields id and ts, no nulls.";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

loadEnv();
const apiKey = process.env.SERV_API_KEY;
if (!apiKey) {
  console.error("SERV_API_KEY is not set. Create a key at https://console.openserv.ai and put it in .env");
  process.exit(1);
}

const capParam = arg("cap-param", SERV_CAP_PARAM);
if (!["max_completion_tokens", "max_tokens"].includes(capParam)) {
  console.error(`--cap-param must be max_completion_tokens or max_tokens, got ${capParam}`);
  process.exit(1);
}
const prose = arg("prose", DEFAULT_PROSE);
const tools = parseServTools();
const messages = buildMessages(prose);

console.log("model         :", SERV_MODEL);
console.log("prompt_sha256 :", PROMPT_SHA256);
console.log("cap param     :", `${capParam}=${SERV_MAX_OUTPUT_TOKENS}`);
console.log("serv tools    :", tools.map((t) => t.function.name).join(", ") || "(none)");
console.log("user message  :", messages[1].content);
console.log("");

let response;
let content;
try {
  content = await createServComplete({ apiKey, capParam, tools, onResponse: (r) => (response = r) })(messages, "claims");
} catch (err) {
  console.error("SERV request FAILED");
  console.error("status :", err?.status ?? "(none)");
  console.error("message:", err?.message ?? String(err));
  if (err?.error) console.error("body   :", JSON.stringify(err.error, null, 2));
  if (err?.status === 400) {
    console.error(`\nIf the error names ${capParam} as unsupported, retry with --cap-param=${capParam === "max_tokens" ? "max_completion_tokens" : "max_tokens"}`);
  }
  process.exit(1);
}

const choice = response?.choices?.[0];
console.log("raw content   :", JSON.stringify(content));
console.log("finish_reason :", choice?.finish_reason ?? "(none)");
if (choice?.message?.refusal) console.log("refusal       :", choice.message.refusal);
console.log("usage         :", JSON.stringify(response?.usage ?? null, null, 2));

const claims = parseClaims(content);
if (!claims) {
  console.error('\nNot a valid claims object (production retries once, then records SERV_INVALID). If finish_reason is "length", the cap is too small for the reasoning tokens.');
  process.exit(1);
}
const { claims: grounded, dropped } = ground(claims, prose);
console.log("parsed claims :", JSON.stringify(claims));
if (dropped.length) console.log("grounded      :", JSON.stringify(grounded), `(dropped: ${dropped.join(", ")})`);
console.log("\nOK. This is the exact request production makes for the main claims.");
