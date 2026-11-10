// Kite Passport adapter (kpass 6.13.1). Spawns
//   kpass session execute --method GET --url <url> --idempotency-key <key> --output json --no-interactive
// with an argv array, never a shell.
//
// PROVISIONAL PARSER: kpass has only ever answered Tare with an error (Kite refuses sellers that are
// not in its catalog; MEMORY.md), so its success output is unseen. parseKpassOutput accepts the two
// plausible shapes (a JSON object, or an HTTP-style dump: status line, headers, blank line, body)
// and returns paymentHash = null whenever it cannot find a real hash.

import { spawn } from "node:child_process";
import { TX_HASH } from "./txhash.js";

// PAYMENT-RESPONSE may be the bare tx hash, or base64 JSON (x402 v2 settlement object).
// Returns the hash string or null. Never fabricates.
export function decodePaymentResponse(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (TX_HASH.test(v)) return v;
  let obj;
  try {
    obj = JSON.parse(Buffer.from(v, "base64").toString("utf8"));
  } catch {
    try {
      obj = JSON.parse(v);
    } catch {
      return null;
    }
  }
  for (const key of ["transaction", "txHash", "transactionHash", "tx_hash", "hash"]) {
    if (typeof obj?.[key] === "string" && TX_HASH.test(obj[key])) return obj[key];
  }
  return null;
}

function headerLookup(headers, name) {
  if (!headers || typeof headers !== "object") return null;
  const hit = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return hit ? headers[hit] : null;
}

export function parseKpassOutput(stdout) {
  const text = String(stdout ?? "");

  // Shape 1: JSON.
  try {
    const j = JSON.parse(text);
    const status = Number(j.status ?? j.statusCode ?? j.http_status);
    const header = headerLookup(j.headers, "payment-response") ?? j.paymentResponse ?? j.payment_response ?? null;
    const out = { status: Number.isFinite(status) ? status : null, paymentHash: decodePaymentResponse(header) };
    // Prefer the seller's exact bytes; a body kpass already parsed can only be re-serialised, and
    // then the evidence hash is of Tare's serialisation, which the receipt must say.
    const b64 = j.body_base64 ?? j.bodyBase64 ?? null;
    if (typeof b64 === "string") {
      const bytes = Buffer.from(b64, "base64");
      return { ...out, bodyBytes: bytes, bodyText: bytes.toString("utf8") };
    }
    const body = j.body ?? j.data ?? null;
    if (body === null || typeof body === "string") return { ...out, bodyText: body };
    return { ...out, bodyText: JSON.stringify(body), bodyNote: "kpass returned the body already parsed; the body hash is of Tare's re-serialisation, not the seller's raw bytes" };
  } catch {
    // not JSON
  }

  // Shape 2: HTTP-style dump.
  const m = text.match(/HTTP\/[\d.]+\s+(\d{3})/i) ?? text.match(/\bstatus\W+(\d{3})\b/i);
  const status = m ? Number(m[1]) : null;
  const hm = text.match(/^\s*payment-response\s*:\s*(\S+)\s*$/im);
  const paymentHash = hm ? decodePaymentResponse(hm[1]) : null;
  const split = text.search(/\r?\n\r?\n/);
  const bodyText = split >= 0 ? text.slice(split).trim() : null;
  return { status, bodyText, paymentHash };
}

export function createKpass({ bin = "kpass", timeoutMs = 180_000 } = {}) {
  return {
    execute(url, { idempotencyKey } = {}) {
      if (!idempotencyKey) return Promise.reject(new Error("kpass session execute needs an idempotency key"));
      return new Promise((resolve, reject) => {
        // --no-interactive: kpass never prompts here (the session was approved beforehand with a
        // passkey). stderr is inherited so its messages stay visible. The idempotency key is
        // required, so a retry can never pay twice.
        const args = ["session", "execute", "--method", "GET", "--url", url, "--idempotency-key", idempotencyKey, "--output", "json", "--no-interactive"];
        const child = spawn(bin, args, {
          stdio: ["inherit", "pipe", "inherit"],
          shell: false,
        });
        const chunks = []; // raw bytes: decoding chunk by chunk would split multi-byte characters
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          // The payment may still settle after we stop waiting: the outcome is unknown, not failed.
          reject(Object.assign(new Error(`kpass timed out after ${timeoutMs} ms`), { outcome: "unknown" }));
        }, timeoutMs);
        child.stdout.on("data", (d) => chunks.push(d));
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          const out = Buffer.concat(chunks).toString("utf8");
          if (code !== 0) {
            let detail = out.slice(0, 500);
            try {
              const j = JSON.parse(out);
              detail = `${j.error_code ?? "error"}: ${j.error ?? j.hint ?? ""}`.slice(0, 500);
            } catch {
              // not JSON
            }
            return reject(new Error(`kpass exited with code ${code}: ${detail}`));
          }
          resolve({ ...parseKpassOutput(out), raw: out });
        });
      });
    },
  };
}
