// Pure verification. No I/O, no model, no network. See SPEC.md "Check".
//
// The model's only influence is the four typed claim values. Whether a delivery is clean,
// disputed or unverifiable is decided here and nowhere else.

export const RULES = ["shape", "count", "unique", "fields", "no_nulls", "fresh"];
const FUTURE_SKEW_MS = 5 * 60 * 1000;

// Parse the paid body text into { prose, rows }. Returns null when the body does not have the
// payload shape (JSON object with a string `prose` and an array-of-objects `rows`).
export function parseBody(bodyText) {
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (typeof data.prose !== "string") return null;
  if (!Array.isArray(data.rows)) return null;
  if (!data.rows.every((r) => r !== null && typeof r === "object" && !Array.isArray(r))) return null;
  return { prose: data.prose, rows: data.rows };
}

export function measure(rows) {
  const ids = new Set();
  for (const r of rows) {
    if (Object.hasOwn(r, "id") && r.id !== null && r.id !== undefined) ids.add(String(r.id));
  }
  return { count: rows.length, unique_count: ids.size };
}

const isEmpty = (v) => v === null || v === undefined || v === "";

// Age in hours of the oldest row's `ts` relative to `now`; null if any row has no parseable ts.
export function oldestAgeHours(rows, now) {
  let oldest = 0;
  for (const r of rows) {
    const t = Date.parse(r?.ts);
    if (!Number.isFinite(t)) return null;
    oldest = Math.max(oldest, (now - t) / 3_600_000);
  }
  return Math.round(oldest * 10) / 10;
}

// rows: array of objects (already shape-checked). claims: output of serv.parseClaims.
// now: the delivery time in ms (the freshness rule measures row timestamps against it).
// Returns { count, unique_count, oldest_age_hours, failed: [rule…], verdict }.
export function check(rows, claims, { now = Date.now() } = {}) {
  const { count, unique_count } = measure(rows);
  const failed = [];
  const { claimed_count, unique, fields, no_nulls } = claims;
  const max_age_hours = claims.max_age_hours ?? null;

  if (claimed_count !== null) {
    const measured = unique === true ? unique_count : count;
    if (claimed_count !== measured) failed.push("count");
  }

  if (unique === true && unique_count !== count) failed.push("unique");

  if (fields !== null) {
    if (!rows.every((r) => fields.every((f) => Object.hasOwn(r, f)))) failed.push("fields");
  }

  if (no_nulls === true) {
    const bad = rows.some((r) => {
      const keys = fields ?? Object.keys(r);
      return keys.some((k) => Object.hasOwn(r, k) && isEmpty(r[k]));
    });
    if (bad) failed.push("no_nulls");
  }

  // fresh: every row's `ts` must parse and fall within the claimed window (a little clock skew into
  // the future is tolerated). A row without a usable ts cannot prove it is fresh.
  if (max_age_hours !== null) {
    const stale = rows.some((r) => {
      const t = Date.parse(r?.ts);
      return !Number.isFinite(t) || now - t > max_age_hours * 3_600_000 || t - now > FUTURE_SKEW_MS;
    });
    if (stale) failed.push("fresh");
  }

  // Fail closed: a delivery whose label makes no count claim cannot be verified, whatever the
  // reason (the seller said nothing, or the model was steered into returning nulls).
  let verdict;
  if (failed.length) verdict = "dispute";
  else if (claimed_count === null) verdict = "unverifiable";
  else verdict = "clean";

  return { count, unique_count, oldest_age_hours: oldestAgeHours(rows, now), failed, verdict, details: details(rows, claims, { now }) };
}

// The specifics behind each failed rule, measured in code: how many ids repeat, which promised field
// is missing from how many rows, how many checked values are empty, how many rows are outside the
// promised time window. Plain numbers only; they are what a dispute explanation may cite.
export function details(rows, claims, { now = Date.now() } = {}) {
  const { count, unique_count } = measure(rows);
  const out = { rows: count, unique_ids: unique_count, duplicate_ids: count - unique_count };
  if (claims?.fields) {
    const missing = {};
    for (const f of claims.fields) {
      const n = rows.filter((r) => !Object.hasOwn(r, f)).length;
      if (n) missing[f] = n;
    }
    out.rows_missing_field = missing;
  }
  if (claims?.no_nulls === true) {
    const empty = {};
    for (const r of rows) for (const k of claims.fields ?? Object.keys(r)) if (Object.hasOwn(r, k) && isEmpty(r[k])) empty[k] = (empty[k] ?? 0) + 1;
    out.empty_values = empty;
  }
  const window = claims?.max_age_hours ?? null;
  if (window !== null) {
    out.rows_outside_window = rows.filter((r) => {
      const t = Date.parse(r?.ts);
      return !Number.isFinite(t) || now - t > window * 3_600_000 || t - now > FUTURE_SKEW_MS;
    }).length;
  }
  return out;
}

// For bodies that fail parseBody: a paid but unreadable delivery is a failed delivery.
export function shapeFailure() {
  return { count: null, unique_count: null, oldest_age_hours: null, failed: ["shape"], verdict: "dispute" };
}
