import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { jsonError } from "@/lib/api-helpers";
import {
  ingestPayloadSchema,
  MAX_INGEST_BODY_BYTES,
  canonicalizeIp,
  isGeoIpEligiblePublicAddress,
} from "@/modules/access-log/logic";
import { recordAccessLogEntry } from "@/modules/access-log/service";

// Server-to-server ingestion from this app's own local ip-log-agent.mjs and
// (via the public agent port) from other self-hosted servers' own agent
// instances. Deliberately NOT requireSessionApi()/isTrustedOrigin() — those
// are for browser-originated requests carrying a session cookie and an
// Origin header; this call has neither, and isTrustedOrigin() would reject
// every legitimate call outright (no Origin header => always untrusted).

function parseIngestKeys(): Map<string, string> {
  const raw = process.env.ACCESS_LOG_INGEST_KEYS;
  if (!raw) return new Map();
  try {
    const obj: unknown = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return new Map();
    return new Map(
      Object.entries(obj as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return new Map();
  }
}

function timingSafeStringEqual(a: string, b: string): boolean {
  // Hashing first normalizes both sides to the same length — timingSafeEqual
  // throws on a length mismatch, and comparing raw lengths first would
  // itself leak timing information about the expected key's length.
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Reads the body with a hard byte cap, honored even without a
 * Content-Length header (a chunked body could otherwise be read
 * unboundedly via req.json()). Returns null if the cap is exceeded.
 */
async function readLimitedBody(req: Request, maxBytes: number): Promise<string | null> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) return null;
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function POST(req: Request) {
  // Cheap rejection before touching the body at all: no Bearer token, no
  // point reading anything. (Per-source key lookup still requires the body
  // — see below — so this is only the fast-path for the common "no header"
  // case, not the only auth check.)
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!bearer) return jsonError(401, "UNAUTHENTICATED", "Invalid credentials");

  const bodyText = await readLimitedBody(req, MAX_INGEST_BODY_BYTES);
  if (bodyText === null) return jsonError(413, "PAYLOAD_TOO_LARGE", "Request body too large");

  let parsedBody: unknown;
  try {
    parsedBody = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return jsonError(400, "INVALID_BODY", "Malformed JSON body");
  }

  const result = ingestPayloadSchema.safeParse(parsedBody);
  if (!result.success) {
    return jsonError(400, "INVALID_BODY", "Malformed payload", result.error.flatten().fieldErrors);
  }

  // Per-source credential: source is a caller-asserted label bound to its
  // own key here, not an identity the request itself proves any other way.
  // Unknown source and a wrong key for a known source must be
  // indistinguishable to the caller — both fall through to the same 401.
  const expectedKey = parseIngestKeys().get(result.data.source);
  if (!expectedKey || !timingSafeStringEqual(bearer, expectedKey)) {
    return jsonError(401, "UNAUTHENTICATED", "Invalid credentials");
  }

  const canonicalIp = canonicalizeIp(result.data.ip);
  if (!canonicalIp) {
    return jsonError(400, "INVALID_BODY", "Malformed payload", { ip: ["not a valid IP address"] });
  }

  // This log is meant to answer "who connected from outside" — a private/
  // loopback/reserved address (an internal hop's own address when a chain
  // of trusted-upstream relays isn't fully wired up yet, a local curl test,
  // etc.) is never a real external visitor, so it's never stored at all,
  // not even as a placeholder. Reuses the same public-unicast classification
  // GeoIP eligibility already needed — the criterion ("is this an ordinary
  // public client address") is identical for both purposes here.
  if (!isGeoIpEligiblePublicAddress(canonicalIp)) {
    return new NextResponse(null, { status: 204 });
  }

  await recordAccessLogEntry({
    source: result.data.source,
    ip: canonicalIp,
    method: result.data.method,
    path: result.data.path,
    userAgent: result.data.userAgent,
  });

  return new NextResponse(null, { status: 204 });
}
