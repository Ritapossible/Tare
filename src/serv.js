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
// ---------- grounding (code) ----------
// SERV is good at reading phrasing and bad at admitting a text says nothing: on real service
// descriptions it invented counts, "unique" and "no nulls". So every claim must be supported by the
// seller's own words, or code drops it. Code may drop a claim; it never adds or changes one.

const FIELD_WORDS = /\b(fields?|columns?|attributes?|properties|campos?|columnas?)\b/i;
const UNIQUE_WORDS = /\b(unique|distinct|de-?duplicated|no duplicates?|without duplicates|únic[oa]s?|distint[oa]s?|sin duplicados)\b/i;
const NULL_WORDS = /\b(nulls?|empty|missing|blanks?|nulos?|vac[ií][oa]s?)\b/i;
const BOUND_BEFORE = /(up to|at most|max(imum)?|as many as|no more than|less than|fewer than|under|over|more than|at least|hasta|≤|≥|<|>|~|≈|about|around|approx(imately|\.)?|roughly|nearly|almost|aproximadamente|unos|unas)\s*$/i;

const WORD_VALUES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, dozen: 12,
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};
const SCALES = { hundred: 100, thousand: 1000, mil: 1000, million: 1_000_000 };
const NUMBER_TOKEN = new RegExp(`^(${[...Object.keys(WORD_VALUES), ...Object.keys(SCALES)].join("|")})$`, "i");

// Exact numbers the text states, with whether each is bounded ("up to 20", "10,000+").
export function statedNumbers(prose) {
  const text = String(prose ?? "");
  const out = [];
  for (const m of text.matchAll(/\d{1,3}(?:[,\u202f ]\d{3})+(?![\d])|\d+/g)) {
    // Part of a price, decimal, percentage, time or ratio: not a count ("$0.002", "~7%", "23:59").
    const prev = text[m.index - 1] ?? "";
    const next = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
    if (/[.$€£:\/]/.test(prev) || /^(%|:|\/|[.,]\d|x\b)/i.test(next)) continue;
    if (prev === "-" && /[A-Za-z]/.test(text[m.index - 2] ?? "")) continue; // an identifier, e.g. "HIP-4"
    const value = Number(m[0].replace(/[,\u202f ]/g, ""));
    const before = text.slice(Math.max(0, m.index - 16), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 1);
    out.push({ value, bounded: BOUND_BEFORE.test(before) || after === "+" });
  }
  // Runs of number words: "twelve hundred and forty", "one thousand two hundred forty-one".
  const tokens = [...text.matchAll(/[A-Za-zÁÉÍÓÚáéíóúñÑ]+/g)];
  let i = 0;
  while (i < tokens.length) {
    if (!NUMBER_TOKEN.test(tokens[i][0])) { i++; continue; }
    const start = tokens[i].index;
    let total = 0, current = 0, seen = false;
    while (i < tokens.length) {
      const w = tokens[i][0].toLowerCase();
      if ((w === "and" || w === "y") && seen && NUMBER_TOKEN.test(tokens[i + 1]?.[0] ?? "")) { i++; continue; }
      if (w in WORD_VALUES) { current += WORD_VALUES[w]; seen = true; i++; continue; }
      if (w in SCALES) {
        const k = SCALES[w];
        if (k === 100) current = (current || 1) * 100;
        else { total += (current || 1) * k; current = 0; }
        seen = true; i++; continue;
      }
      break;
    }
    // A lone "one"/"una" is almost always an article ("in one call"), not a promised count.
    const lone = i - tokens.findIndex((t) => t.index === start) === 1 && total + current === 1;
    if (seen && !lone) out.push({ value: total + current, bounded: BOUND_BEFORE.test(text.slice(Math.max(0, start - 16), start)) });
  }
  return out;
}

function hasWord(text, word) {
  const w = String(word).trim();
  if (!w) return false;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${esc}($|[^\\p{L}\\p{N}_])`, "iu").test(text);
}

const UNIT_HOURS = [
  [/^(minutes?|mins?|minutos?)$/i, (n) => Math.max(1, Math.ceil(n / 60))],
  [/^(hours?|hrs?|h|horas?)$/i, (n) => n],
  [/^(days?|d[ií]as?)$/i, (n) => n * 24],
  [/^(weeks?|semanas?)$/i, (n) => n * 168],
  [/^(months?|mes(es)?)$/i, (n) => n * 720],
];
// Time windows the text names explicitly, in hours. "latest" or "real-time" name none.
export function statedWindows(prose) {
  const text = String(prose ?? "");
  const hours = new Set();
  const unitOf = (u) => UNIT_HOURS.find(([re]) => re.test(u))?.[1];
  for (const m of text.matchAll(/(\d+)\s*-?\s*([A-Za-zíÍ]+)/g)) {
    if (BOUND_BEFORE.test(text.slice(Math.max(0, m.index - 16), m.index))) continue; // "~2 days" is not a window
    const f = unitOf(m[2]);
    if (f) hours.add(f(Number(m[1])));
  }
  for (const m of text.matchAll(/\b(last|past|this|within an?|within the|[uú]ltim[oa]s?|esta|este)\s+([A-Za-zíÍ]+)/gi)) {
    const f = unitOf(m[2].replace(/'s$/i, ""));
    if (f) hours.add(f(1));
  }
  for (const m of text.matchAll(/\b(?:last|past|within|[uú]ltim[oa]s)\s+([a-z]+)\s+(minutes?|hours?|days?|weeks?|horas?|d[ií]as?|semanas?)\b/gi)) {
    const n = WORD_VALUES[m[1].toLowerCase()];
    const f = unitOf(m[2]);
    if (n && f) hours.add(f(n));
  }
  if (/\b(today|hoy)\b/i.test(text)) hours.add(24);
  if (/\b(yesterday|ayer)\b/i.test(text)) hours.add(48);
  if (/\bthis week'?s?\b|\besta semana\b/i.test(text)) hours.add(168);
  return hours;
}

// Returns { claims, dropped }; dropped lists the claims the text did not support.
export function ground(claims, prose) {
  if (!claims) return { claims, dropped: [] };
  const text = String(prose ?? "");
  const out = { ...claims };
  const dropped = [];
  const drop = (k) => { if (out[k] !== null && out[k] !== undefined) { out[k] = null; dropped.push(k); } };

  if (out.claimed_count !== null && out.claimed_count !== undefined) {
    const ok = statedNumbers(text).some((n) => n.value === out.claimed_count && !n.bounded);
    if (!ok) drop("claimed_count");
  }
  if (out.unique !== null && out.unique !== undefined && !UNIQUE_WORDS.test(text)) drop("unique");
  if (out.no_nulls !== null && out.no_nulls !== undefined && !NULL_WORDS.test(text)) drop("no_nulls");
  if (out.fields && !(FIELD_WORDS.test(text) && out.fields.every((f) => hasWord(text, f)))) drop("fields");
  if (out.max_age_hours !== null && out.max_age_hours !== undefined && !statedWindows(text).has(out.max_age_hours)) drop("max_age_hours");
  return { claims: out, dropped };
}

export function groundClaims(claims, prose) {
  return ground(claims, prose).claims;
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
  const grounded = ground({ ...main.claims, max_age_hours }, prose);
  if (grounded.dropped.length) notes.push(`claims dropped, not in the seller's text: ${grounded.dropped.join(", ")}`);
  return { claims: grounded.claims, attempts: main.attempts, notes };
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
    if (claims) return { claims, attempts };
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
