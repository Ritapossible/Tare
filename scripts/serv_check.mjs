// Step 0: one SERV completion. Prints the raw content, finish_reason and usage.
// On auth, balance or model errors it prints the error and exits non-zero. Do not continue
// building on top of SERV until this passes.
//
// Usage:
//   node scripts/serv_check.mjs                      # uses max_completion_tokens
//   node scripts/serv_check.mjs --cap-param=max_tokens
//   node scripts/serv_check.mjs --prose="Delivered two hundred records."

import OpenAI from "openai";
import {
  SERV_BASE_URL,
  SERV_MODEL,
  SERV_REASONING_EFFORT,
  SERV_MAX_OUTPUT_TOKENS,
  PROMPT_SHA256,
  buildMessages,
} from "../src/prompt.js";

const DEFAULT_PROSE =
  "Delivered one thousand two hundred forty unique records, fields id and ts, no nulls.";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file; fall back to the real environment.
}

const apiKey = process.env.SERV_API_KEY;
if (!apiKey) {
  console.error("SERV_API_KEY is not set. Create a key at https://console.openserv.ai and put it in .env");
  process.exit(1);
}

const capParam = arg("cap-param", "max_completion_tokens");
if (!["max_completion_tokens", "max_tokens"].includes(capParam)) {
  console.error(`--cap-param must be max_completion_tokens or max_tokens, got ${capParam}`);
  process.exit(1);
}
const prose = arg("prose", DEFAULT_PROSE);

const client = new OpenAI({ baseURL: SERV_BASE_URL, apiKey, maxRetries: 0 });

const request = {
  model: SERV_MODEL,
  reasoning_effort: SERV_REASONING_EFFORT,
  [capParam]: SERV_MAX_OUTPUT_TOKENS,
  messages: buildMessages(prose),
};

console.log("model         :", SERV_MODEL);
console.log("prompt_sha256 :", PROMPT_SHA256);
console.log("cap param     :", `${capParam}=${SERV_MAX_OUTPUT_TOKENS}`);
console.log("user message  :", request.messages[1].content);
console.log("");

let response;
try {
  response = await client.chat.completions.create(request);
} catch (err) {
  console.error("SERV request FAILED");
  console.error("status :", err?.status ?? "(none)");
  console.error("message:", err?.message ?? String(err));
  if (err?.error) console.error("body   :", JSON.stringify(err.error, null, 2));
  if (err?.status === 400) {
    console.error(
      `\nIf the error names ${capParam} as unsupported, retry with --cap-param=` +
        (capParam === "max_tokens" ? "max_completion_tokens" : "max_tokens"),
    );
  }
  process.exit(1);
}

const choice = response.choices?.[0];
const content = choice?.message?.content ?? null;

console.log("raw content   :", JSON.stringify(content));
console.log("finish_reason :", choice?.finish_reason ?? "(none)");
console.log("usage         :", JSON.stringify(response.usage ?? null, null, 2));

if (!content) {
  console.error(
    "\nEmpty content. If finish_reason is \"length\", the output cap is too small for the reasoning tokens.",
  );
  process.exit(1);
}

try {
  const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  console.log("parsed JSON   :", JSON.stringify(parsed));
} catch {
  console.error("\nContent is not valid JSON. Record this in MEMORY.md; serv.js retries once on this.");
  process.exit(1);
}

console.log("\nOK. Record finish_reason, usage and the cap param in MEMORY.md.");
