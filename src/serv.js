// SERV claim extraction. SERV reads the prose and returns four typed claims. It never sees the
// rows and is never asked for a verdict. See SPEC.md "SERV call" and "Parse rule".

import OpenAI from "openai";
import {
  SERV_BASE_URL,
  SERV_MODEL,
  SERV_REASONING_EFFORT,
  SERV_MAX_OUTPUT_TOKENS,
  SERV_CAP_PARAM,
  SERV_RESPONSE_FORMAT,
  FRESHNESS_PROMPT,
  FRESHNESS_RESPONSE_FORMAT,
  TIME_WORDS,
  buildMessages,
} from "./prompt.js";

export class ServError extends Error {
  constructor(code, message, attempts) {
    super(message);
    this.name = "ServError";
    this.code = code; // "SERV_INVALID" | "SERV_API"
    this.attempts = attempts; // [{ raw, error }]
  }
}

const isBoolOrNull = (v) => v === null || typeof v === "boolean";

// The parse rule. Returns { claimed_count, unique, fields, no_nulls, max_age_hours } or null if invalid.
// Every key other than these five is dropped and never read.
export function parseClaims(text) {
  if (typeof text !== "string") return null;
  const stripped = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");
  let data;
  try {
    data = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const claimed_count = data.claimed_count ?? null;
  const unique = data.unique ?? null;
  const no_nulls = data.no_nulls ?? null;
  let fields = data.fields ?? null;
  const max_age_hours = data.max_age_hours ?? null;

  if (claimed_count !== null && !(Number.isInteger(claimed_count) && claimed_count >= 0)) return null;
  if (!isBoolOrNull(unique) || !isBoolOrNull(no_nulls)) return null;
  if (fields !== null) {
    if (!Array.isArray(fields)) return null;
    if (!fields.every((f) => typeof f === "string" && f.length > 0)) return null;
    if (fields.length === 0) fields = null; // "no fields named" is the same as not saying
  }
  if (max_age_hours !== null && !(Number.isInteger(max_age_hours) && max_age_hours >= 1)) return null;
  return { claimed_count, unique, fields, no_nulls, max_age_hours };
}

// Grounding (code, not the model): a "fields" claim only counts when the prose actually talks about
// fields or columns. Measured on 2026-11-10: SERV turned the noun in "Delivered 1,240 records" into
// fields ["records"] in several runs, which would falsely dispute an honest seller.
const FIELD_WORDS = /\b(fields?|columns?|keys?|attributes?|properties|campos?|columnas?)\b/i;
export function groundClaims(claims, prose) {
  if (claims?.fields && !FIELD_WORDS.test(String(prose ?? ""))) return { ...claims, fields: null };
  return claims;
}

export function parseFreshness(text) {
  if (typeof text !== "string") return null;
  let data;
  try {
    data = JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1"));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const v = data.max_age_hours ?? null;
  if (v !== null && !(Number.isInteger(v) && v >= 1)) return null;
  return { max_age_hours: v };
}

// complete(messages, kind) → Promise<string|null> (the raw content); kind is "claims" or "freshness".
// Injected so tests never hit SERV. Returns { claims, attempts, notes }.
export async function extractClaims(prose, { complete }) {
  const main = await extractMain(prose, complete);
  const notes = [];
  let max_age_hours = main.claims.max_age_hours ?? null;
  if (max_age_hours === null && TIME_WORDS.test(String(prose))) {
    const fresh = await extractFreshness(prose, complete);
    main.attempts.push(...fresh.attempts);
    if (fresh.value) max_age_hours = fresh.value.max_age_hours;
    else notes.push("freshness not read: SERV gave no valid answer, so freshness was not checked");
  }
  return { claims: { ...main.claims, max_age_hours }, attempts: main.attempts, notes };
}

async function extractFreshness(prose, complete) {
  const messages = buildMessages(prose, FRESHNESS_PROMPT);
  const attempts = [];
  for (let i = 0; i < 2; i++) {
    let raw;
    try {
      raw = await complete(messages, "freshness");
    } catch (err) {
      attempts.push({ raw: null, error: err?.message ?? String(err), kind: "freshness" });
      return { value: null, attempts };
    }
    const value = parseFreshness(raw);
    attempts.push({ raw, error: value ? null : "invalid freshness JSON", kind: "freshness" });
    if (value) return { value, attempts };
  }
  return { value: null, attempts };
}

async function extractMain(prose, complete) {
  const messages = buildMessages(prose);
  const attempts = [];
  for (let i = 0; i < 2; i++) {
    let raw;
    try {
      raw = await complete(messages, "claims");
    } catch (err) {
      attempts.push({ raw: null, error: err?.message ?? String(err) });
      throw new ServError("SERV_API", `SERV request failed: ${err?.message ?? err}`, attempts);
    }
    const claims = parseClaims(raw);
    attempts.push({ raw, error: claims ? null : "invalid claims JSON" });
    if (claims) return { claims: groundClaims(claims, prose), attempts };
  }
  throw new ServError("SERV_INVALID", "SERV returned invalid claims twice", attempts);
}

// Real SERV completion function.
export function createServComplete({ apiKey, capParam = SERV_CAP_PARAM } = {}) {
  if (!apiKey) throw new Error("SERV_API_KEY is not set");
  // Built-in fetch (not the SDK's bundled HTTP client) so an HTTPS proxy configured for Node
  // (NODE_USE_ENV_PROXY=1) is honoured; behaviour is otherwise identical.
  const client = new OpenAI({ baseURL: SERV_BASE_URL, apiKey, maxRetries: 0, timeout: 60_000, fetch: globalThis.fetch });
  return async (messages, kind = "claims") => {
    const res = await client.chat.completions.create({
      model: SERV_MODEL,
      reasoning_effort: SERV_REASONING_EFFORT,
      [capParam]: SERV_MAX_OUTPUT_TOKENS,
      response_format: kind === "freshness" ? FRESHNESS_RESPONSE_FORMAT : SERV_RESPONSE_FORMAT,
      messages,
    });
    return res.choices?.[0]?.message?.content ?? null;
  };
}
