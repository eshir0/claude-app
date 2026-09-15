#!/usr/bin/env node
// Generic, dependency-free reverse-proxy + access-log reporter. Runs
// identically in front of claude-app itself and in front of any other
// self-hosted server that wants its connections centralized on this
// dashboard's /access-log page — copy this one file, no repo/deps needed.
//
// Required env:
//   AGENT_SOURCE_NAME    label reported for every request this instance sees,
//                        e.g. "claude-app" — must match a key in the central
//                        dashboard's ACCESS_LOG_INGEST_KEYS.
//   AGENT_INGEST_URL     the central dashboard's ingest endpoint. This
//                        instance's own service (claude-app itself) can use
//                        the loopback address, e.g.
//                        http://127.0.0.1:3001/api/access-log/ingest — a
//                        REMOTE guest must use the dashboard's LAN address
//                        on its PUBLIC agent port instead, e.g.
//                        http://<claude-app LAN IP>:3000/api/access-log/ingest
//                        (127.0.0.1 only resolves on the dashboard's own box).
//   AGENT_INGEST_KEY     this source's own credential (per-source, not a
//                        secret shared across every server).
// Optional env:
//   AGENT_PUBLIC_PORT       port this agent listens on (default 3000)
//   AGENT_APP_HOST          the real local service to forward to (default 127.0.0.1)
//   AGENT_APP_PORT          (default 3001)
//   AGENT_SKIP_PATH_PREFIXES  comma-separated path prefixes never logged
//                             (default "/_next/static/,/_next/image,/favicon.ico")
//
// The ingest path itself (derived from AGENT_INGEST_URL) is NEVER logged as
// an access event, regardless of AGENT_SKIP_PATH_PREFIXES — otherwise a
// remote guest's own report, proxied through this instance's public port,
// would create a spurious second log row for itself.
//
// Trust boundary: this is designed for a private, trusted LAN/tunnel. Both
// the proxied traffic and the ingest report travel over plain HTTP —
// acceptable on a trusted home-lab network, NOT acceptable across an
// untrusted network or the public internet without adding TLS/VPN in front.

import { createServer, request as httpRequest } from "node:http";
import { isIP } from "node:net";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[ip-log-agent] Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

const SOURCE_NAME = requireEnv("AGENT_SOURCE_NAME");
const INGEST_URL = requireEnv("AGENT_INGEST_URL");
const INGEST_KEY = requireEnv("AGENT_INGEST_KEY");
const PUBLIC_PORT = Number(process.env.AGENT_PUBLIC_PORT || 3000);
const APP_HOST = process.env.AGENT_APP_HOST || "127.0.0.1";
const APP_PORT = Number(process.env.AGENT_APP_PORT || 3001);
const SKIP_PREFIXES = (process.env.AGENT_SKIP_PATH_PREFIXES || "/_next/static/,/_next/image,/favicon.ico")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const INGEST_URL_PARSED = new URL(INGEST_URL);
const INGEST_PATH = INGEST_URL_PARSED.pathname; // hardcoded skip, not overridable via config
const UPSTREAM_TIMEOUT_MS = 30_000;
const REPORT_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// IP canonicalization — duplicated from src/modules/access-log/logic.ts's
// canonicalizeIp(). Keep the two in sync; this plain Node script can't
// import through the repo's "@/*" TS path alias (no bundler/loader here),
// so a byte-for-byte shared module isn't practical — see that file's tests
// for the invariants this must also satisfy.
// ---------------------------------------------------------------------------

const IPV4_MAPPED_RE = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

function isCanonicalIPv4Octet(s) {
  if (!/^\d{1,3}$/.test(s)) return false;
  if (s.length > 1 && s[0] === "0") return false;
  return Number(s) <= 255;
}

function canonicalizeIPv4Text(raw) {
  const parts = raw.split(".");
  if (parts.length !== 4 || !parts.every(isCanonicalIPv4Octet)) return null;
  return parts.map((p) => String(Number(p))).join(".");
}

function hexPairToIPv4(hi, lo) {
  const hiNum = parseInt(hi, 16);
  const loNum = parseInt(lo, 16);
  const b0 = (hiNum >> 8) & 0xff;
  const b1 = hiNum & 0xff;
  const b2 = (loNum >> 8) & 0xff;
  const b3 = loNum & 0xff;
  return `${b0}.${b1}.${b2}.${b3}`;
}

function canonicalizeIp(raw) {
  const trimmed = raw.trim();
  if (isIP(trimmed) === 4) return canonicalizeIPv4Text(trimmed);
  if (isIP(trimmed) === 6) {
    let canonical;
    try {
      canonical = new URL(`http://[${trimmed}]/`).hostname;
    } catch {
      return null;
    }
    if (canonical.startsWith("[") && canonical.endsWith("]")) canonical = canonical.slice(1, -1);
    const mapped = IPV4_MAPPED_RE.exec(canonical);
    if (mapped) return hexPairToIPv4(mapped[1], mapped[2]);
    return canonical.toLowerCase();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Access-log reporting — fire-and-forget, never affects the proxied
// response either way.
// ---------------------------------------------------------------------------

function reportEntry(entry) {
  let body;
  try {
    body = JSON.stringify(entry);
  } catch (err) {
    console.error("[ip-log-agent] failed to serialize log entry:", err.message);
    return;
  }
  const req = httpRequest(
    {
      protocol: INGEST_URL_PARSED.protocol,
      hostname: INGEST_URL_PARSED.hostname,
      port: INGEST_URL_PARSED.port || (INGEST_URL_PARSED.protocol === "https:" ? 443 : 80),
      path: INGEST_URL_PARSED.pathname,
      method: "POST",
      timeout: REPORT_TIMEOUT_MS,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        authorization: `Bearer ${INGEST_KEY}`,
      },
    },
    (res) => {
      res.resume(); // drain and discard — we don't act on the response body
    },
  );
  req.on("timeout", () => req.destroy());
  req.on("error", (err) => {
    console.error("[ip-log-agent] ingest report failed:", err.message);
  });
  req.end(body);
}

function shouldSkipLogging(pathname) {
  if (pathname === INGEST_PATH) return true;
  return SKIP_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Reverse proxy
// ---------------------------------------------------------------------------

const server = createServer((clientReq, clientRes) => {
  const remoteAddress = clientReq.socket.remoteAddress || "";
  const canonicalIp = canonicalizeIp(remoteAddress);

  let pathname;
  try {
    pathname = new URL(clientReq.url, `http://${APP_HOST}`).pathname;
  } catch {
    pathname = clientReq.url;
  }

  // Never trust a client-sent forwarding header — overwrite unconditionally
  // with what this process itself observed on the raw socket.
  const forwardHeaders = { ...clientReq.headers };
  delete forwardHeaders["x-forwarded-for"];
  delete forwardHeaders["x-real-ip"];
  forwardHeaders["x-forwarded-for"] = canonicalIp || remoteAddress;
  forwardHeaders["host"] = `${APP_HOST}:${APP_PORT}`;

  const upstreamReq = httpRequest(
    {
      hostname: APP_HOST,
      port: APP_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: forwardHeaders,
      timeout: UPSTREAM_TIMEOUT_MS,
    },
    (upstreamRes) => {
      // upstreamRes.headers already arrives with a "set-cookie" array when
      // the upstream sent multiple Set-Cookie lines — writeHead relays an
      // array value as multiple header lines, never joined into one string.
      clientRes.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    },
  );

  upstreamReq.on("timeout", () => {
    upstreamReq.destroy(new Error("upstream request timed out"));
  });

  upstreamReq.on("error", (err) => {
    console.error("[ip-log-agent] upstream error:", err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
    }
    if (!clientRes.writableEnded) clientRes.end("Bad Gateway");
  });

  clientReq.on("aborted", () => upstreamReq.destroy());
  clientRes.on("close", () => {
    if (!upstreamReq.destroyed) upstreamReq.destroy();
  });

  clientReq.pipe(upstreamReq);

  if (canonicalIp) {
    if (!shouldSkipLogging(pathname)) {
      reportEntry({
        source: SOURCE_NAME,
        ip: canonicalIp,
        method: clientReq.method,
        path: pathname,
        userAgent: clientReq.headers["user-agent"],
      });
    }
  } else {
    console.error(
      `[ip-log-agent] could not canonicalize remote address "${remoteAddress}" — logging skipped for this request only, proxying continues`,
    );
  }
});

server.on("clientError", (err, socket) => {
  if (!socket.destroyed) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PUBLIC_PORT, "0.0.0.0", () => {
  console.log(
    `[ip-log-agent] source="${SOURCE_NAME}" listening on 0.0.0.0:${PUBLIC_PORT} -> http://${APP_HOST}:${APP_PORT}, reporting to ${INGEST_URL}`,
  );
});
