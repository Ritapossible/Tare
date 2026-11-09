// Pure verification. No I/O, no model, no network. See SPEC.md "Check".
//
// The model's only influence is the four typed claim values. Whether a delivery is clean,
// disputed or unverifiable is decided here and nowhere else.

export const RULES = ["shape", "count", "unique", "fields", "no_nulls"];

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

// rows: array of objects (already shape-checked). claims: output of serv.parseClaims.
// Returns { count, unique_count, failed: [rule…], verdict: "clean" | "dispute" | "unverifiable" }.
export function check(rows, claims) {
  const { count, unique_count } = measure(rows);
  const failed = [];
  const { claimed_count, unique, fields, no_nulls } = claims;

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

  // Fail closed: a delivery whose label makes no count claim cannot be verified, whatever the
  // reason (the seller said nothing, or the model was steered into returning nulls).
  let verdict;
  if (failed.length) verdict = "dispute";
  else if (claimed_count === null) verdict = "unverifiable";
  else verdict = "clean";

  return { count, unique_count, failed, verdict };
}

// For bodies that fail parseBody: a paid but unreadable delivery is a failed delivery.
export function shapeFailure() {
  return { count: null, unique_count: null, failed: ["shape"], verdict: "dispute" };
}
