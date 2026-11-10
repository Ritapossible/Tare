// The payment order from SPEC.md. This is the only module that may call kpass.
//
// deps = {
//   store,                       // Store
//   kpass: { execute(url) },     // → { status, bodyText, paymentHash|null, raw }
//   extract(prose),              // → { claims, attempts } or throws ServError
//   promptSha256, now(), newId()
// }

import { createHash, randomUUID } from "node:crypto";
import { parseBody, check, shapeFailure } from "./check.js";

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

export function originOf(url) {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`unsupported URL scheme: ${u.protocol}`);
  return u.origin;
}

export function createBuyer(deps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => randomUUID());
  const { store, kpass, extract, promptSha256 } = deps;

  // Buys run strictly one at a time, so two clicks can never race past the checks below.
  let queue = Promise.resolve();
  function buy(url, opts = {}) {
    const run = queue.then(() => buyOnce(url, opts));
    queue = run.catch(() => {});
    return run;
  }

  async function buyOnce(url, { requestId } = {}) {
    const origin = originOf(url);
    const request_id = requestId ?? newId();
    const idempotency_key = `${origin}|${request_id}`;

    const base = {
      id: `rcpt_${newId()}`,
      request_id,
      idempotency_key,
      url,
      origin,
      tx_hash: null,
      body_sha256: null,
      prompt_sha256: promptSha256,
      claims: null,
      count: null,
      unique_count: null,
      failed: [],
      reason: null,
      error: null,
      created_at: now(),
    };

    // 1. Same request seen before: return what happened, never pay again.
    const seen = store.byKey(idempotency_key);
    if (seen) return { ...seen, replayed: true };

    // 2. Blocklisted origin: refuse before kpass.
    const blocked = store.blockEntry(origin);
    if (blocked) {
      return store.put({ ...base, status: "refused", reason: `seller held (${blocked.reason})` });
    }

    // 3. An unresolved pending payment to this origin (e.g. a crash mid-payment): we do not know
    //    whether it settled, so refuse until a human resolves it.
    const pending = store.pendingFor(origin);
    if (pending) {
      return store.put({ ...base, status: "refused", reason: `unresolved pending payment ${pending.id}` });
    }

    // 4. Record intent before paying.
    let receipt = store.put({ ...base, status: "pending" });
    const finish = (patch) => (receipt = store.put({ ...receipt, ...patch }));

    // 5. Pay.
    store.countKpassCall();
    let paid;
    try {
      paid = await kpass.execute(url, { idempotencyKey: `tare-${request_id}` });
    } catch (err) {
      return finish({ status: "failed", error: `kpass: ${err?.message ?? err}` });
    }
    if (paid.status !== 200) {
      return finish({ status: "failed", error: `kpass returned HTTP ${paid.status}` });
    }
    if (!paid.paymentHash) {
      // Never invent a hash. Without one we do not judge the delivery.
      return finish({ status: "paid_unverified", error: "no PAYMENT-RESPONSE hash returned" });
    }
    const bodyText = paid.bodyText ?? "";
    finish({ tx_hash: paid.paymentHash, body_sha256: sha256(bodyText) });

    // 6. Read the label (prose only) with SERV, unless the body is unreadable.
    const body = parseBody(bodyText);
    let result;
    if (!body) {
      result = shapeFailure();
    } else {
      let claims;
      try {
        ({ claims } = await extract(body.prose));
      } catch (err) {
        return finish({ status: "paid_unchecked", error: `${err.code ?? "SERV_ERROR"}: ${err.message}` });
      }
      finish({ claims });
      // 7. Code decides.
      result = check(body.rows, claims);
    }

    finish({
      status: result.verdict,
      count: result.count,
      unique_count: result.unique_count,
      failed: result.failed,
    });

    if (result.verdict === "dispute" || result.verdict === "unverifiable") {
      store.block(origin, { receipt_id: receipt.id, reason: result.verdict, at: now() });
    }
    return receipt;
  }

  return { buy };
}
