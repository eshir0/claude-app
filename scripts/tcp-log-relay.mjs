#!/usr/bin/env node
// Generic raw-TCP relay with optional PROXY protocol v1 chaining — for
// non-HTTP (or HTTP-but-opaque, e.g. HTTPS/TLS) services where
// ip-log-agent.mjs's "inject an X-Forwarded-For header" approach doesn't
// apply, because the backend (e.g. Proxmox's pveproxy) has no mechanism to
// read or trust a forwarded-IP header at all.
//
// Unlike ip-log-agent.mjs, this never inspects or modifies the actual
// payload once past the optional PROXY protocol preamble — it's a
// byte-for-byte pipe, so TLS (or any other protocol) passes through
// completely unaffected. The real client IP is carried between OUR OWN
// relay hops only, via a synthetic PROXY protocol v1 header line that is
// never sent to the final backend at all (RELAY_EMIT_PROXY_PROTOCOL must be
// unset/false on whichever hop's target is the real backend).
//
// Required env:
//   RELAY_LISTEN_PORT
//   RELAY_TARGET_HOST
//   RELAY_TARGET_PORT
// Optional env:
//   RELAY_TRUSTED_UPSTREAM_IPS   comma-separated exact IPs of immediate
//     peers whose PROXY protocol v1 header is parsed and trusted — same
//     network-position trust model as ip-log-agent.mjs's own
//     AGENT_TRUSTED_UPSTREAM_IPS. Default empty: every connection's raw
//     socket address IS the client IP; no header is ever expected/parsed.
//   RELAY_EMIT_PROXY_PROTOCOL   "true" to prepend a PROXY protocol v1
//     header to the outgoing connection, for a hop whose own next hop is
//     ANOTHER instance of this script expecting one. NEVER set this on the
//     hop whose target is the real backend — an unexpected header there
//     would corrupt that protocol's own handshake.
//   RELAY_SOURCE_NAME / RELAY_INGEST_URL / RELAY_INGEST_KEY   same
//     ingest-reporting contract as ip-log-agent.mjs (both URL/KEY set
//     together, or both omitted for pure-relay mode). SOURCE_NAME is
//     required if either is set.

import { createServer, connect } from "node:net";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[tcp-log-relay] Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

const LISTEN_PORT = Number(requireEnv("RELAY_LISTEN_PORT"));
const TARGET_HOST = requireEnv("RELAY_TARGET_HOST");
const TARGET_PORT = Number(requireEnv("RELAY_TARGET_PORT"));

const TRUSTED_UPSTREAM_IPS = new Set(
  (process.env.RELAY_TRUSTED_UPSTREAM_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const EMIT_PROXY_PROTOCOL = process.env.RELAY_EMIT_PROXY_PROTOCOL === "true";

const SOURCE_NAME = process.env.RELAY_SOURCE_NAME || null;
const INGEST_URL = process.env.RELAY_INGEST_URL || null;
const INGEST_KEY = process.env.RELAY_INGEST_KEY || null;
if (Boolean(INGEST_URL) !== Boolean(INGEST_KEY)) {
  console.error("[tcp-log-relay] RELAY_INGEST_URL and RELAY_INGEST_KEY must be set together, or both omitted");
  process.exit(1);
}
if ((INGEST_URL || INGEST_KEY) && !SOURCE_NAME) {
  console.error("[tcp-log-relay] RELAY_SOURCE_NAME is required when ingest reporting is configured");
  process.exit(1);
}
const INGEST_URL_PARSED = INGEST_URL ? new URL(INGEST_URL) : null;

const PROXY_HEADER_MAX_BYTES = 256; // PROXY v1's own spec caps a real header at 107; generous margin
const PROXY_HEADER_TIMEOUT_MS = 5_000;
const REPORT_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// IP canonicalization — duplicated from src/modules/access-log/logic.ts's
// canonicalizeIp() (same copy as scripts/ip-log-agent.mjs). Keep all three
// in sync; see that file's tests for the invariants this must satisfy.
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
// Access-log reporting — fire-and-forget, never affects the relayed
// connection either way. Raw TCP has no request method/path, so these are
// fixed conventions marking "a raw TCP connection" rather than an HTTP
// request (ingestPayloadSchema requires both fields; "/" and "CONNECT" are
// syntactically valid and semantically the closest HTTP analogue).
// ---------------------------------------------------------------------------

function reportEntry(ip) {
  if (!INGEST_URL_PARSED) return;
  const body = JSON.stringify({ source: SOURCE_NAME, ip, method: "CONNECT", path: "/" });
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
    (res) => res.resume(),
  );
  req.on("timeout", () => req.destroy());
  req.on("error", (err) => console.error("[tcp-log-relay] ingest report failed:", err.message));
  req.end(body);
}

// ---------------------------------------------------------------------------
// PROXY protocol v1 (text): "PROXY TCP4 <src> <dst> <srcport> <dstport>\r\n"
// followed immediately by the raw stream. Only field[2] (src ip) is ever
// read by this script — the rest exist only because the format requires
// them to be present and syntactically valid.
// ---------------------------------------------------------------------------

function writeProxyHeader(socket, clientIp) {
  const proto = isIP(clientIp) === 6 ? "TCP6" : "TCP4";
  socket.write(`PROXY ${proto} ${clientIp} ${TARGET_HOST} 0 ${TARGET_PORT}\r\n`);
}

/**
 * Reads exactly one PROXY protocol v1 header line from `socket` and calls
 * back with the claimed source IP and any already-buffered bytes that
 * follow it (which must not be dropped — they're the start of the real
 * payload). Calls back with an error (not a thrown exception) on a
 * malformed/missing header, a header exceeding the byte cap, or a timeout —
 * the caller is expected to fail closed (destroy the connection) in every
 * error case, never guess at a partially-read header.
 */
function readProxyHeader(socket, callback) {
  let buf = Buffer.alloc(0);
  let done = false;

  const timer = setTimeout(() => {
    finish(new Error("timed out waiting for PROXY protocol header"), null, null);
  }, PROXY_HEADER_TIMEOUT_MS);

  function finish(err, clientIp, leftover) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    socket.removeListener("data", onData);
    socket.removeListener("error", onError);
    // Attaching a "data" listener above put the socket into flowing mode;
    // removing the listener does NOT undo that — without this pause, any
    // bytes arriving between now and whenever relay() below attaches its
    // own pipe (only once the outbound connection to the next hop
    // finishes, which is not instant) would be delivered to no one and
    // silently dropped, corrupting whatever protocol is layered on top
    // (a lost byte partway into a TLS ClientHello reliably breaks the
    // whole handshake). Pausing here queues them instead; relay()'s
    // eventual .pipe() resumes the flow from exactly where this left off.
    socket.pause();
    callback(err, clientIp, leftover);
  }

  function onData(chunk) {
    buf = Buffer.concat([buf, chunk]);
    const idx = buf.indexOf("\r\n");
    if (idx !== -1) {
      const line = buf.subarray(0, idx).toString("ascii");
      const rest = buf.subarray(idx + 2);
      const parts = line.split(" ");
      if (parts[0] !== "PROXY" || parts.length < 6 || !parts[2]) {
        finish(new Error(`malformed PROXY protocol header: ${JSON.stringify(line)}`), null, null);
        return;
      }
      finish(null, parts[2], rest);
      return;
    }
    if (buf.length > PROXY_HEADER_MAX_BYTES) {
      finish(new Error("PROXY protocol header exceeded max length without a terminator"), null, null);
    }
  }

  function onError(err) {
    finish(err, null, null);
  }

  socket.on("data", onData);
  socket.on("error", onError);
}

// ---------------------------------------------------------------------------
// Relay
// ---------------------------------------------------------------------------

// Some routers/NAT devices (home routers, carrier-grade NAT) silently drop
// a TCP connection's state after enough quiet time, with no FIN/RST either
// side ever sees — invisible to us until the next write into a half-dead
// connection fails. TCP keep-alive probes traffic on an otherwise-idle
// connection specifically to keep that state alive end-to-end. Cheap
// insurance for a long-lived session (hours, e.g. a game connection) that
// may go quiet between app-level packets; harmless for a short-lived one.
const KEEPALIVE_DELAY_MS = 30_000;

function relay(clientSocket, remoteAddress, clientIp, leftover) {
  clientSocket.setKeepAlive(true, KEEPALIVE_DELAY_MS);

  const upstream = connect(TARGET_PORT, TARGET_HOST, () => {
    upstream.setKeepAlive(true, KEEPALIVE_DELAY_MS);
    if (EMIT_PROXY_PROTOCOL) writeProxyHeader(upstream, clientIp || remoteAddress);
    if (leftover && leftover.length) upstream.write(leftover);
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  });

  upstream.on("error", (err) => {
    console.error("[tcp-log-relay] upstream connect error:", err.message);
    clientSocket.destroy();
  });
  clientSocket.on("error", () => upstream.destroy());
  clientSocket.on("close", () => upstream.destroy());
  upstream.on("close", () => clientSocket.destroy());

  if (clientIp) {
    reportEntry(clientIp);
  } else {
    console.error(
      `[tcp-log-relay] could not determine a client ip for remote address "${remoteAddress}" — logging skipped for this connection only, relay continues`,
    );
  }
}

const server = createServer((clientSocket) => {
  const remoteAddress = clientSocket.remoteAddress || "";
  const peerIp = canonicalizeIp(remoteAddress);

  if (peerIp && TRUSTED_UPSTREAM_IPS.has(peerIp)) {
    readProxyHeader(clientSocket, (err, claimedIp, leftover) => {
      if (err) {
        // Fail closed: a trusted peer that doesn't send a well-formed
        // header is a bug or a misconfiguration, never something to guess
        // through — never relay partially-read, unparsed bytes.
        console.error("[tcp-log-relay] rejecting connection from trusted peer:", err.message);
        clientSocket.destroy();
        return;
      }
      const canonical = canonicalizeIp(claimedIp);
      relay(clientSocket, remoteAddress, canonical || peerIp, leftover);
    });
    return;
  }

  relay(clientSocket, remoteAddress, peerIp, Buffer.alloc(0));
});

server.on("error", (err) => {
  console.error("[tcp-log-relay] server error:", err.message);
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
  const bits = [`listening on 0.0.0.0:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`];
  if (TRUSTED_UPSTREAM_IPS.size) bits.push(`trusting PROXY protocol from [${[...TRUSTED_UPSTREAM_IPS].join(",")}]`);
  if (EMIT_PROXY_PROTOCOL) bits.push("emitting PROXY protocol upstream");
  bits.push(INGEST_URL ? `reporting to ${INGEST_URL}` : "pure-relay mode (no ingest configured)");
  console.log(`[tcp-log-relay] ${bits.join(", ")}`);
});
