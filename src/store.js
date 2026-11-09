// Receipts, blocklist, idempotency index and the kpass call counter.
//
// Every mutating method reads, changes and writes synchronously, so no two mutations can interleave
// inside one Node process. buy.js additionally runs buys one at a time.

import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const empty = () => ({ receipts: [], blocklist: {}, idempotency: {}, kpass_calls: 0 });

function fileBackend(path) {
  return {
    read() {
      try {
        return { ...empty(), ...JSON.parse(readFileSync(path, "utf8")) };
      } catch (err) {
        if (err.code === "ENOENT") return empty();
        throw err;
      }
    },
    write(state) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
      renameSync(tmp, path); // atomic on the same filesystem
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

  reset() {
    this.backend.write(empty());
  }
}

export const fileStore = (path) => new Store(fileBackend(path));
export const memoryStore = () => new Store(memoryBackend());
