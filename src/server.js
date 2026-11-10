// Local console server: serves web/ and a small API. Binds to 127.0.0.1 only.
//
// Because this API can spend testnet funds, it defends against other websites in the browser:
//   - Host must be 127.0.0.1:<port> or localhost:<port>  (blocks DNS rebinding)
//   - POST requires Content-Type: application/json AND X-Tare-Request: 1
//     (a custom header forces a CORS preflight, which this server never approves)
//   - Origin, when sent, must be this server
//   - the browser can only name a seller key from sellers.json, never a URL

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, sep, extname } from "node:path";
import { buildState } from "./state.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const REQUEST_ID = /^[A-Za-z0-9_-]{1,100}$/;

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    "content-type": isJson ? MIME[".json"] : headers["content-type"] ?? MIME[".txt"],
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readJson(req, limit = 4096) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("invalid JSON"), { status: 400 });
  }
}

async function resolveStatic(webRoot, pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (p.includes("\0")) return null;
  const candidates = p.endsWith("/") ? [join(p, "index.html")] : [p, `${p}.html`, join(p, "index.html")];
  for (const c of candidates) {
    const full = resolve(webRoot, `.${c}`);
    if (full !== webRoot && !full.startsWith(webRoot + sep)) return null; // path traversal
    try {
      if ((await stat(full)).isFile()) return full;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function createApp({ tare, sellers, webRoot }) {
  const root = resolve(webRoot);

  const server = createServer(async (req, res) => {
    try {
      const port = req.socket.localPort;
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!allowedHosts.has(req.headers.host ?? "")) return send(res, 421, { error: "unexpected Host" });

      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === "/api/state") {
        if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
        return send(res, 200, buildState({ store: tare.store, sellers, mode: "live" }));
      }

      if (url.pathname === "/api/buy") {
        if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });
        const origin = req.headers.origin;
        if (origin && !allowedHosts.has(origin.replace(/^https?:\/\//, ""))) {
          return send(res, 403, { error: "cross-origin request refused" });
        }
        if (req.headers["x-tare-request"] !== "1") return send(res, 403, { error: "missing X-Tare-Request header" });
        if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
          return send(res, 415, { error: "content-type must be application/json" });
        }
        const body = await readJson(req);
        // JSON.parse accepts null, numbers and arrays: anything but an object is a bad request.
        if (!body || typeof body !== "object" || Array.isArray(body)) return send(res, 400, { error: "body must be a JSON object" });
        const key = body.seller;
        if (typeof key !== "string" || !Object.hasOwn(sellers, key)) return send(res, 400, { error: "unknown seller" });
        const sellerUrl = sellers[key];
        if (!sellerUrl) return send(res, 409, { error: `seller ${key} has no URL in sellers.json` });
        if (body.request_id !== undefined && !(typeof body.request_id === "string" && REQUEST_ID.test(body.request_id))) {
          return send(res, 400, { error: "invalid request_id" });
        }
        const receipt = await tare.buy(sellerUrl, { requestId: body.request_id });
        return send(res, 200, { receipt });
      }

      if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "not found" });
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method not allowed" });

      const file = await resolveStatic(root, url.pathname);
      if (!file) {
        const notFound = await resolveStatic(root, "/404.html");
        return send(res, 404, notFound ? await readFile(notFound) : "not found", { "content-type": MIME[".html"] });
      }
      return send(res, 200, await readFile(file), {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
        "x-frame-options": "DENY",
      });
    } catch (err) {
      return send(res, err.status ?? 500, { error: err.status ? err.message : "internal error" });
    }
  });

  return server;
}
