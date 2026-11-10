// Receipts, blocklist, idempotency index and the kpass call counter.
//
// Every mutating method reads, changes and writes synchronously, so no two mutations can interleave
// inside one Node process. buy.js additionally runs buys one at a time.

import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";

const empty = () => ({ receipts: [], blocklist: {}, idempotency: {}, kpass_calls: 0, direct_spent_units: "0" });

// The parsed file is cached and re-read only when its mtime or size changes, so a change made by
// another process (e.g. scripts/unblock.mjs while the console runs) is still seen. Callers always
// get a private copy, because #mutate edits what read() returns.
function fileBackend(path) {
  let cache = null; // { stamp, state }
  const stampOf = () => {
    try {
      const s = statSync(path);
      return `${s.mtimeMs}:${s.size}`;
    } catch (err) {
      if (err.code === "ENOENT") return "missing";
      throw err;
    }
  };
  return {
    read() {
      const stamp = stampOf();
      if (cache?.stamp !== stamp) {
        const state = stamp === "missing" ? empty() : { ...empty(), ...JSON.parse(readFileSync(path, "utf8")) };
        cache = { stamp, state };
      }
      return structuredClone(cache.state);
    },
    write(state) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
      renameSync(tmp, path); // atomic on the same filesystem
      cache = { stamp: stampOf(), state: structuredClone(state) };
    },
  };
}

function memoryBackend() {
  let state = empty();
  return {
    read: () => structuredClone(state),
    write: (s) => {
      state = structuredClone(s);
    },
  };
}

export class Store {
  constructor(backend) {
    this.backend = backend;
  }

  #mutate(fn) {
    const state = this.backend.read();
    const out = fn(state);
    this.backend.write(state);
    return out;
  }

  snapshot() {
    return this.backend.read();
  }

  receipts() {
    return this.backend.read().receipts;
  }

  blockEntry(origin) {
    return this.backend.read().blocklist[origin] ?? null;
  }

  byKey(key) {
    const s = this.backend.read();
    const id = s.idempotency[key];
    return id ? s.receipts.find((r) => r.id === id) ?? null : null;
  }

  pendingFor(origin) {
    return this.backend.read().receipts.find((r) => r.origin === origin && r.status === "pending") ?? null;
  }

  put(receipt) {
    return this.#mutate((s) => {
      const i = s.receipts.findIndex((r) => r.id === receipt.id);
      if (i >= 0) s.receipts[i] = receipt;
      else s.receipts.push(receipt);
      if (receipt.idempotency_key) s.idempotency[receipt.idempotency_key] = receipt.id;
      return receipt;
    });
  }

  block(origin, entry) {
    this.#mutate((s) => {
      s.blocklist[origin] = entry;
    });
  }

  unblock(origin) {
    return this.#mutate((s) => {
      const had = Object.hasOwn(s.blocklist, origin);
      delete s.blocklist[origin];
      return had;
    });
  }

  countKpassCall() {
    return this.#mutate((s) => ++s.kpass_calls);
  }

  kpassCalls() {
    return this.backend.read().kpass_calls;
  }

  // Ledger for the x402-direct rail (atomic pieUSD units, as a decimal string).
  directSpent() {
    return BigInt(this.backend.read().direct_spent_units ?? "0");
  }

  addDirectSpent(units) {
    return this.#mutate((s) => {
      s.direct_spent_units = (BigInt(s.direct_spent_units ?? "0") + BigInt(units)).toString();
      return s.direct_spent_units;
    });
  }

  // Clears receipts, holds, idempotency and the call counter for a fresh demo take. The direct-rail
  // spend ledger is lifetime and is kept, so a reset never restores the total spending cap.
  reset() {
    const kept = this.backend.read().direct_spent_units ?? "0";
    this.backend.write({ ...empty(), direct_spent_units: kept });
  }
}

export const fileStore = (path) => new Store(fileBackend(path));
export const memoryStore = () => new Store(memoryBackend());
