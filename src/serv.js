// SERV claim extraction. SERV reads the prose and returns four typed claims. It never sees the
// rows and is never asked for a verdict. See SPEC.md "SERV call" and "Parse rule".

import OpenAI from "openai";
import {
  SERV_BASE_URL,
  SERV_MODEL,
  SERV_REASONING_EFFORT,
  SERV_MAX_OUTPUT_TOKENS,
  SERV_CAP_PARAM,
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

// The parse rule. Returns { claimed_count, unique, fields, no_nulls } or null if invalid.
// Every key other than the four is dropped and never read.
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

  if (claimed_count !== null && !(Number.isInteger(claimed_count) && claimed_count >= 0)) return null;
  if (!isBoolOrNull(unique) || !isBoolOrNull(no_nulls)) return null;
  if (fields !== null) {
    if (!Array.isArray(fields)) return null;
    if (!fields.every((f) => typeof f === "string" && f.length > 0)) return null;
    if (fields.length === 0) fields = null; // "no fields named" is the same as not saying
  }
  return { claimed_count, unique, fields, no_nulls };
}

// complete(messages) → Promise<string|null> (the raw content). Injected so tests never hit SERV.
export async function extractClaims(prose, { complete }) {
  const messages = buildMessages(prose);
  const attempts = [];
  for (let i = 0; i < 2; i++) {
    let raw;
    try {
      raw = await complete(messages);
    } catch (err) {
      attempts.push({ raw: null, error: err?.message ?? String(err) });
      throw new ServError("SERV_API", `SERV request failed: ${err?.message ?? err}`, attempts);
    }
    const claims = parseClaims(raw);
    attempts.push({ raw, error: claims ? null : "invalid claims JSON" });
    if (claims) return { claims, attempts };
  }
  throw new ServError("SERV_INVALID", "SERV returned invalid claims twice", attempts);
}

// Real SERV completion function.
export function createServComplete({ apiKey, capParam = SERV_CAP_PARAM } = {}) {
  if (!apiKey) throw new Error("SERV_API_KEY is not set");
  const client = new OpenAI({ baseURL: SERV_BASE_URL, apiKey, maxRetries: 0, timeout: 60_000 });
  return async (messages) => {
    const res = await client.chat.completions.create({
      model: SERV_MODEL,
      reasoning_effort: SERV_REASONING_EFFORT,
      [capParam]: SERV_MAX_OUTPUT_TOKENS,
      messages,
    });
    return res.choices?.[0]?.message?.content ?? null;
  };
}
