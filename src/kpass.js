// Kite Passport adapter. Spawns `kpass agent session execute` with an argv array (never a shell).
//
// PROVISIONAL PARSER: the exact output of `kpass agent session execute` has not been captured yet
// (MEMORY.md open question 1). parseKpassOutput accepts the two plausible shapes (a JSON object, or
// an HTTP-style dump of status line, headers, blank line, body) and returns paymentHash = null
// whenever it cannot find a real hash. It is rewritten against the real output once captured.

import { spawn } from "node:child_process";

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

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
    const body = j.body ?? j.data ?? null;
    const bodyText = typeof body === "string" ? body : body === null ? null : JSON.stringify(body);
    const header = headerLookup(j.headers, "payment-response") ?? j.paymentResponse ?? j.payment_response ?? null;
    return { status: Number.isFinite(status) ? status : null, bodyText, paymentHash: decodePaymentResponse(header) };
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
    execute(url) {
      return new Promise((resolve, reject) => {
        // stdin and stderr are inherited so any prompt kpass shows reaches the human.
        const child = spawn(bin, ["agent", "session", "execute", "--method", "GET", "--url", url], {
          stdio: ["inherit", "pipe", "inherit"],
          shell: false,
        });
        let out = "";
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error(`kpass timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        child.stdout.on("data", (d) => (out += d));
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code !== 0) return reject(new Error(`kpass exited with code ${code}: ${out.slice(0, 500)}`));
          resolve({ ...parseKpassOutput(out), raw: out });
        });
      });
    },
  };
}
