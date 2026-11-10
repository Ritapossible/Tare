// The payment order from SPEC.md. This is the only module that may call kpass.
//
// deps = {
//   store,                       // Store
//   kpass: { execute(url) },     // → { status, bodyText, bodyBytes?, bodyNote?, paymentHash|null, raw }
//   extract(prose),              // → { claims, attempts } or throws ServError
//   promptSha256, now(), newId()
// }

import { createHash, randomUUID } from "node:crypto";
import { parseBody, check, shapeFailure } from "./check.js";

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
// Evidence hash of the delivery: the seller's exact bytes when the rail has them.
const bodyHash = (paid) => (paid.bodyBytes ? createHash("sha256").update(paid.bodyBytes).digest("hex") : sha256(paid.bodyText ?? ""));
const bodyNotes = (paid) => (paid.bodyNote ? { body_notes: [paid.bodyNote] } : {});

// Payment-rail idempotency key: hex, fixed length, derived from Tare's own origin|request_id key.
export function paymentKey(idempotencyKey) {
  return `tare-${sha256(idempotencyKey).slice(0, 40)}`;
}

export function originOf(url) {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`unsupported URL scheme: ${u.protocol}`);
  return u.origin;
}

export function createBuyer(deps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => randomUUID());
  const { store, kpass, extract, promptSha256, paymentRail = null, feedCheck = null, readAdvertisement = null } = deps;

  // Buys run strictly one at a time, so two clicks can never race past the checks below.
  let queue = Promise.resolve();
  function buy(url, opts = {}) {
    const run = queue.then(() => buyOnce(url, opts));
    queue = run.catch(() => {});
    return run;
  }

  async function buyOnce(url, { requestId, allowFeedHold = false } = {}) {
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
      payment_rail: paymentRail,
      claims: null,
      count: null,
      unique_count: null,
      failed: [],
      reason: null,
      error: null,
      feed_notes: [],
      promise: null, // the seller's prose, word for word (from the delivery)
      advertised: null, // the seller's description in its 402 payment request (before payment)
      advertised_claims: null,
      ad_notes: [],
      oldest_age_hours: null,
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

    // 3b. Trusted seller-record feeds (opt-in). A seller held in a feed the operator trusts is
    //     stopped before payment unless a human explicitly allows this buy. Feed problems never
    //     block a buy and are always written on the receipt.
    if (feedCheck) {
      let result;
      try {
        result = await feedCheck(origin);
      } catch (err) {
        result = { hold: null, notes: [`feed check failed: ${err?.message ?? err}`] };
      }
      base.feed_notes = [...(result.notes ?? [])];
      if (result.hold) {
        const where = `held in trusted feed ${result.hold.source} (${result.hold.reason})`;
        if (!allowFeedHold) {
          return store.put({ ...base, status: "refused", reason: where });
        }
        base.feed_notes.push(`${where}; this buy was allowed by the operator`);
      }
    }

    // 3c. The seller's advertisement: the description in its 402 payment request, read with an
    //     unpaid request before any money moves. Problems are noted, never fatal.
    if (readAdvertisement) {
      try {
        const ad = await readAdvertisement(url);
        base.advertised = ad?.description ?? null;
        if (ad?.note) base.ad_notes.push(ad.note);
      } catch (err) {
        base.ad_notes.push(`advertisement unavailable: ${err?.message ?? err}`);
      }
    }

    // 4. Record intent before paying.
    let receipt = store.put({ ...base, status: "pending" });
    const finish = (patch) => (receipt = store.put({ ...receipt, ...patch }));

    // 5. Pay.
    store.countKpassCall();
    let paid;
    try {
      // Scoped to origin + request id (the same id on two sellers must never share a payment key).
      paid = await kpass.execute(url, { idempotencyKey: paymentKey(idempotency_key) });
    } catch (err) {
      if (err?.outcome === "unknown") {
        // We cannot tell whether money moved. Stay pending: the origin is refused until a human
        // checks the chain. Never mark it failed (that would allow a second payment).
        return finish({ status: "pending", error: `payment outcome unknown: ${err?.message ?? err}` });
      }
      return finish({ status: "failed", error: `payment: ${err?.message ?? err}` });
    }
    if (paid.status !== 200 && paid.paymentHash) {
      // Settled, but the seller did not deliver. Keep the real hash; nothing usable was delivered.
      finish({ tx_hash: paid.paymentHash, body_sha256: bodyHash(paid), ...bodyNotes(paid), error: `seller returned HTTP ${paid.status} after settlement` });
      const r = shapeFailure();
      finish({ status: r.verdict, count: r.count, unique_count: r.unique_count, failed: r.failed });
      store.block(origin, { receipt_id: receipt.id, reason: r.verdict, at: now() });
      return receipt;
    }
    if (paid.status !== 200) {
      return finish({ status: "failed", error: `payment returned HTTP ${paid.status}` });
    }
    if (!paid.paymentHash) {
      // Never invent a hash. Without one we do not judge the delivery.
      return finish({ status: "paid_unverified", error: "no PAYMENT-RESPONSE hash returned" });
    }
    const bodyText = paid.bodyText ?? "";
    finish({ tx_hash: paid.paymentHash, body_sha256: bodyHash(paid), ...bodyNotes(paid) });

    // 6. Read the label (prose only) with SERV, unless the body is unreadable.
    const body = parseBody(bodyText);
    let result;
    if (!body) {
      result = shapeFailure();
    } else {
      let claims, servNotes;
      try {
        ({ claims, notes: servNotes } = await extract(body.prose));
      } catch (err) {
        return finish({ status: "paid_unchecked", error: `${err.code ?? "SERV_ERROR"}: ${err.message}` });
      }
      finish({ claims, promise: body.prose, serv_notes: servNotes ?? [] });
      // 7. Code decides.
      const at = Date.parse(receipt.created_at);
      const nowMs = Number.isFinite(at) ? at : Date.now();
      result = check(body.rows, claims, { now: nowMs });

      // 7b. The advertisement is a promise too: check it against the same rows.
      if (receipt.advertised) {
        let adClaims = null;
        try {
          ({ claims: adClaims } = await extract(receipt.advertised));
        } catch (err) {
          finish({ ad_notes: [...receipt.ad_notes, `advertisement not read: ${err.code ?? "SERV_ERROR"}: ${err.message}`] });
        }
        if (adClaims) {
          const ad = check(body.rows, adClaims, { now: nowMs });
          const adFailed = ad.failed.map((f) => `advertised:${f}`);
          const failed = [...result.failed, ...adFailed];
          const anyCount = claims.claimed_count !== null || adClaims.claimed_count !== null;
          finish({ advertised_claims: adClaims });
          result = { ...result, failed, verdict: failed.length ? "dispute" : anyCount ? "clean" : "unverifiable" };
        }
      }
    }

    finish({
      status: result.verdict,
      count: result.count,
      unique_count: result.unique_count,
      oldest_age_hours: result.oldest_age_hours ?? null,
      failed: result.failed,
    });

    if (result.verdict === "dispute" || result.verdict === "unverifiable") {
      store.block(origin, { receipt_id: receipt.id, reason: result.verdict, at: now() });
    }
    return receipt;
  }

  return { buy };
}
