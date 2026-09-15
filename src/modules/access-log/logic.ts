// Pure functions only — no server-only, no Prisma — so unit tests can import
// this directly. service.ts (server-only) and the ingest route are the
// callers that touch the network/DB.

import { isIP } from "node:net";
import { z } from "zod";

// ---------------------------------------------------------------------------
// IP canonicalization
//
// Invariant: two textual representations of the same real address must
// always canonicalize to the same stored string, so one real client never
// splits into two IpSummary rows. IPv4-mapped IPv6 (any valid textual form —
// dotted or hex) collapses to plain IPv4. IPv6 uses Node's built-in WHATWG
// URL host serializer for RFC-5952-equivalent canonical form (lowercase,
// compressed) instead of a hand-rolled parser. Invalid input returns null —
// never stored, never guessed at.
// ---------------------------------------------------------------------------

const IPV4_MAPPED_RE = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

function isCanonicalIPv4Octet(s: string): boolean {
  if (!/^\d{1,3}$/.test(s)) return false;
  if (s.length > 1 && s[0] === "0") return false; // reject ambiguous leading-zero octets (e.g. "010")
  return Number(s) <= 255;
}

function canonicalizeIPv4Text(raw: string): string | null {
  const parts = raw.split(".");
  if (parts.length !== 4 || !parts.every(isCanonicalIPv4Octet)) return null;
  return parts.map((p) => String(Number(p))).join(".");
}

function hexPairToIPv4(hi: string, lo: string): string {
  const hiNum = parseInt(hi, 16);
  const loNum = parseInt(lo, 16);
  const b0 = (hiNum >> 8) & 0xff;
  const b1 = hiNum & 0xff;
  const b2 = (loNum >> 8) & 0xff;
  const b3 = loNum & 0xff;
  return `${b0}.${b1}.${b2}.${b3}`;
}

export function canonicalizeIp(raw: string): string | null {
  const trimmed = raw.trim();
  if (isIP(trimmed) === 4) {
    return canonicalizeIPv4Text(trimmed);
  }
  if (isIP(trimmed) === 6) {
    let canonical: string;
    try {
      canonical = new URL(`http://[${trimmed}]/`).hostname;
    } catch {
      return null;
    }
    if (canonical.startsWith("[") && canonical.endsWith("]")) {
      canonical = canonical.slice(1, -1);
    }
    const mapped = IPV4_MAPPED_RE.exec(canonical);
    if (mapped) return hexPairToIPv4(mapped[1], mapped[2]);
    return canonical.toLowerCase();
  }
  return null;
}

// ---------------------------------------------------------------------------
// GeoIP eligibility — three distinct rule sources, see the module's plan
// doc. Answers "is this an ordinary public client address reasonable to
// send to a third-party GeoIP provider", NOT "is this globally reachable"
// (IANA's own registry tracks that separately, per-entry, and several
// Globally-Reachable=true entries are still excluded here on purpose).
// ---------------------------------------------------------------------------

interface CidrRule {
  base: string;
  prefixLen: number;
  name: string;
}

function ipv4ToInt(ip: string): number {
  const [a, b, c, d] = ip.split(".").map(Number);
  return (((a << 24) | (b << 16) | (c << 8) | d) >>> 0);
}

function cidrContainsV4(ip: number, rule: CidrRule): boolean {
  if (rule.prefixLen === 0) return true;
  const mask = rule.prefixLen === 32 ? 0xffffffff : (~0 << (32 - rule.prefixLen)) >>> 0;
  return (ip & mask) === (ipv4ToInt(rule.base) & mask);
}

// Expands a "::"-compressed or fully-expanded IPv6 literal into a 128-bit
// BigInt. Only ever called on (a) output from canonicalizeIp's WHATWG
// serializer, which is always well-formed, or (b) hand-written CIDR base
// literals below — never on arbitrary raw user input directly.
function ipv6ToBigInt(ip: string): bigint {
  const doubleColonIndex = ip.indexOf("::");
  let groups: string[];
  if (doubleColonIndex !== -1) {
    const left = ip.slice(0, doubleColonIndex);
    const right = ip.slice(doubleColonIndex + 2);
    const leftGroups = left ? left.split(":") : [];
    const rightGroups = right ? right.split(":") : [];
    const missing = 8 - (leftGroups.length + rightGroups.length);
    groups = [...leftGroups, ...Array(Math.max(missing, 0)).fill("0"), ...rightGroups];
  } else {
    groups = ip.split(":");
  }
  let value = BigInt(0);
  for (const g of groups) {
    value = (value << BigInt(16)) | BigInt(parseInt(g || "0", 16));
  }
  return value;
}

function cidrContainsV6(ip: bigint, rule: CidrRule): boolean {
  if (rule.prefixLen === 0) return true;
  const shift = BigInt(128 - rule.prefixLen);
  return ip >> shift === ipv6ToBigInt(rule.base) >> shift;
}

// (B) IANA IPv4 Special-Purpose Address Registry (last updated 2025-10-09).
const IPV4_SPECIAL_PURPOSE: CidrRule[] = [
  { base: "0.0.0.0", prefixLen: 8, name: "This host on this network" },
  { base: "10.0.0.0", prefixLen: 8, name: "Private-Use" },
  { base: "100.64.0.0", prefixLen: 10, name: "Shared Address Space (CGNAT)" },
  { base: "127.0.0.0", prefixLen: 8, name: "Loopback" },
  { base: "169.254.0.0", prefixLen: 16, name: "Link Local" },
  { base: "172.16.0.0", prefixLen: 12, name: "Private-Use" },
  { base: "192.0.0.0", prefixLen: 24, name: "IETF Protocol Assignments" },
  { base: "192.0.2.0", prefixLen: 24, name: "Documentation (TEST-NET-1)" },
  { base: "192.31.196.0", prefixLen: 24, name: "AS112-v4" },
  { base: "192.52.193.0", prefixLen: 24, name: "AMT" },
  { base: "192.88.99.0", prefixLen: 24, name: "6to4 Relay Anycast (deprecated)" },
  { base: "192.168.0.0", prefixLen: 16, name: "Private-Use" },
  { base: "192.175.48.0", prefixLen: 24, name: "Direct Delegation AS112 Service" },
  { base: "198.18.0.0", prefixLen: 15, name: "Benchmarking" },
  { base: "198.51.100.0", prefixLen: 24, name: "Documentation (TEST-NET-2)" },
  { base: "203.0.113.0", prefixLen: 24, name: "Documentation (TEST-NET-3)" },
  { base: "240.0.0.0", prefixLen: 4, name: "Reserved for Future Use" },
  { base: "255.255.255.255", prefixLen: 32, name: "Limited Broadcast" },
];

// (C) Project-conservative — NOT from the Special-Purpose registry (IPv4
// multicast comes from the general IPv4 address-space allocation, not that
// registry) — called out separately so it's never confused for one of its rows.
const IPV4_MULTICAST: CidrRule = { base: "224.0.0.0", prefixLen: 4, name: "Multicast" };

// (A) IANA IPv6 Address Space registry (last updated 2025-10-23): only this
// block is currently allocated for Global Unicast use. This is a positive
// allow-gate, not a denylist — anything outside it is NOT_APPLICABLE
// regardless of the special-purpose tables below.
const IPV6_GLOBAL_UNICAST_GATE: CidrRule = { base: "2000::", prefixLen: 3, name: "Global Unicast" };

// (B) IANA IPv6 Special-Purpose Address Registry (last updated 2025-10-09),
// split into rows that fall INSIDE the (A) gate — these need explicit
// exclusion, the gate alone would wrongly admit them — and rows outside it,
// which the gate already excludes but are kept here for documentation and
// their own explicit regression tests.
const IPV6_SPECIAL_PURPOSE_INSIDE_GATE: CidrRule[] = [
  { base: "2001::", prefixLen: 23, name: "IETF Protocol Assignments" },
  { base: "2001:db8::", prefixLen: 32, name: "Documentation" },
  { base: "2002::", prefixLen: 16, name: "6to4" },
  { base: "2620:4f:8000::", prefixLen: 48, name: "Direct Delegation AS112 Service" },
  { base: "3fff::", prefixLen: 20, name: "Documentation (RFC 9637)" },
];
const IPV6_SPECIAL_PURPOSE_OUTSIDE_GATE: CidrRule[] = [
  { base: "::1", prefixLen: 128, name: "Loopback" },
  { base: "::", prefixLen: 128, name: "Unspecified" },
  { base: "64:ff9b::", prefixLen: 96, name: "IPv4-IPv6 Translation (well-known NAT64)" },
  { base: "64:ff9b:1::", prefixLen: 48, name: "IPv4-IPv6 Translation (Local-Use)" },
  { base: "100::", prefixLen: 64, name: "Discard-Only Address Block" },
  { base: "100:0:0:1::", prefixLen: 64, name: "Dummy IPv6 Prefix (RFC 9780)" },
  { base: "5f00::", prefixLen: 16, name: "Segment Routing (SRv6) SIDs (RFC 9602)" },
  { base: "fc00::", prefixLen: 7, name: "Unique Local" },
  { base: "fe80::", prefixLen: 10, name: "Link-Local Unicast" },
];
// (C) Project-conservative — from RFC 4291 / the IPv6 Address Space
// registry, not the Special-Purpose registry. Already redundant with the
// (A) gate; kept explicit for its own regression test.
const IPV6_MULTICAST: CidrRule = { base: "ff00::", prefixLen: 8, name: "Multicast" };

function isIPv4Text(s: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
}

/**
 * true only for an address reasonable to send to a third-party GeoIP
 * provider. Expects `canonicalIp` to already be the output of
 * canonicalizeIp() above — an invalid/non-canonical string simply returns
 * false rather than throwing.
 */
export function isGeoIpEligiblePublicAddress(canonicalIp: string): boolean {
  if (isIPv4Text(canonicalIp)) {
    const v4 = ipv4ToInt(canonicalIp);
    if (cidrContainsV4(v4, IPV4_MULTICAST)) return false;
    return !IPV4_SPECIAL_PURPOSE.some((r) => cidrContainsV4(v4, r));
  }
  if (isIP(canonicalIp) === 6) {
    const v6 = ipv6ToBigInt(canonicalIp);
    if (!cidrContainsV6(v6, IPV6_GLOBAL_UNICAST_GATE)) return false;
    if (IPV6_SPECIAL_PURPOSE_INSIDE_GATE.some((r) => cidrContainsV6(v6, r))) return false;
    if (IPV6_SPECIAL_PURPOSE_OUTSIDE_GATE.some((r) => cidrContainsV6(v6, r))) return false;
    if (cidrContainsV6(v6, IPV6_MULTICAST)) return false;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Ingest payload validation
// ---------------------------------------------------------------------------

export const MAX_INGEST_BODY_BYTES = 4096;

export const ingestPayloadSchema = z.object({
  source: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
  ip: z.string().min(1).max(45),
  method: z.string().min(1).max(16),
  // Pathname only — must start with "/" and never contain a query string
  // (the agent strips it before sending; this is defense-in-depth, not the
  // only line of defense).
  path: z
    .string()
    .min(1)
    .max(512)
    .refine((p) => p.startsWith("/") && !p.includes("?"), {
      message: "path must be a pathname only, no query string",
    }),
  userAgent: z.string().max(512).optional(),
});
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

// ---------------------------------------------------------------------------
// Dashboard summary merge — combines the three separate Prisma queries
// (see service.ts) since SQLite/Prisma groupBy can't join across models.
// ---------------------------------------------------------------------------

export interface IpSummaryCounts {
  ip: string;
  hitCount: number;
  firstSeen: Date;
  lastSeen: Date;
}
export interface IpSourceRow {
  ip: string;
  source: string;
}
export interface IpGeoRow {
  ip: string;
  status: "RESOLVED" | "NOT_APPLICABLE" | "FAILED";
  country: string | null;
  city: string | null;
}
export interface IpSummary {
  ip: string;
  sources: string[];
  country: string | null;
  city: string | null;
  hitCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

export function mergeIpSummaries(
  counts: IpSummaryCounts[],
  sourceRows: IpSourceRow[],
  geoRows: IpGeoRow[],
): IpSummary[] {
  const sourcesByIp = new Map<string, Set<string>>();
  for (const row of sourceRows) {
    const set = sourcesByIp.get(row.ip) ?? new Set<string>();
    set.add(row.source);
    sourcesByIp.set(row.ip, set);
  }
  const geoByIp = new Map(geoRows.map((r) => [r.ip, r]));

  return counts.map((c) => {
    const geo = geoByIp.get(c.ip);
    return {
      ip: c.ip,
      sources: Array.from(sourcesByIp.get(c.ip) ?? []).sort(),
      country: geo?.status === "RESOLVED" ? geo.country : null,
      city: geo?.status === "RESOLVED" ? geo.city : null,
      hitCount: c.hitCount,
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
    };
  });
}
