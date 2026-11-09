import { readFileSync } from "node:fs";

// Throws unless every URL is set and every origin is distinct. The blocklist is keyed by origin,
// so two sellers on one origin would block each other.
export function assertDistinctOrigins(sellers) {
  const seen = new Map();
  for (const [name, url] of Object.entries(sellers)) {
    if (!url) throw new Error(`seller ${name} has no URL in sellers.json`);
    const origin = new URL(url).origin;
    if (seen.has(origin)) {
      throw new Error(`sellers ${seen.get(origin)} and ${name} share origin ${origin}; deploy them on separate hosts`);
    }
    seen.set(origin, name);
  }
  return sellers;
}

export function loadSellers(path = "sellers.json") {
  return assertDistinctOrigins(JSON.parse(readFileSync(path, "utf8")));
}
