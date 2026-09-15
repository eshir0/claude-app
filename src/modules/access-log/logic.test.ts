import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeIp,
  isGeoIpEligiblePublicAddress,
  ingestPayloadSchema,
  mergeIpSummaries,
} from "./logic.ts";

describe("canonicalizeIp", () => {
  test("plain IPv4 passes through", () => {
    assert.equal(canonicalizeIp("192.168.1.10"), "192.168.1.10");
  });

  test("rejects an ambiguous leading-zero IPv4 octet", () => {
    assert.equal(canonicalizeIp("010.0.0.1"), null);
  });

  test("expanded and compressed IPv6 canonicalize to the same value", () => {
    const expanded = canonicalizeIp("2001:0db8:0000:0000:0000:0000:0000:0001");
    const compressed = canonicalizeIp("2001:db8::1");
    assert.equal(expanded, "2001:db8::1");
    assert.equal(expanded, compressed);
  });

  test("uppercase and lowercase IPv6 canonicalize to the same value", () => {
    assert.equal(canonicalizeIp("2001:DB8::1"), canonicalizeIp("2001:db8::1"));
  });

  test("IPv4-mapped dotted form collapses to plain IPv4", () => {
    assert.equal(canonicalizeIp("::ffff:192.168.1.10"), "192.168.1.10");
  });

  test("IPv4-mapped hex form collapses to the same plain IPv4", () => {
    assert.equal(canonicalizeIp("::ffff:c0a8:10a"), "192.168.1.10");
    assert.equal(canonicalizeIp("::ffff:c0a8:10a"), canonicalizeIp("::ffff:192.168.1.10"));
  });

  test("invalid address returns null", () => {
    assert.equal(canonicalizeIp("not-an-ip"), null);
    assert.equal(canonicalizeIp("999.999.999.999"), null);
  });
});

describe("isGeoIpEligiblePublicAddress — IPv4 Special-Purpose registry (table-driven)", () => {
  const cases: [string, string][] = [
    ["0.1.2.3", "This host on this network"],
    ["10.1.2.3", "Private-Use"],
    ["100.64.1.2", "Shared Address Space"],
    ["127.0.0.1", "Loopback"],
    ["169.254.1.2", "Link Local"],
    ["172.16.1.2", "Private-Use"],
    ["192.0.0.5", "IETF Protocol Assignments"],
    ["192.0.2.5", "Documentation (TEST-NET-1)"],
    ["192.31.196.5", "AS112-v4"],
    ["192.52.193.5", "AMT"],
    ["192.88.99.5", "6to4 Relay Anycast"],
    ["192.168.1.5", "Private-Use"],
    ["192.175.48.5", "Direct Delegation AS112"],
    ["198.18.0.5", "Benchmarking"],
    ["198.51.100.5", "Documentation (TEST-NET-2)"],
    ["203.0.113.5", "Documentation (TEST-NET-3)"],
    ["240.0.0.5", "Reserved for Future Use"],
    ["255.255.255.255", "Limited Broadcast"],
    ["224.0.0.1", "Multicast"],
  ];
  for (const [ip, name] of cases) {
    test(`${ip} (${name}) is not GeoIP-eligible`, () => {
      assert.equal(isGeoIpEligiblePublicAddress(canonicalizeIp(ip)!), false);
    });
  }

  test("a genuine public IPv4 address is eligible", () => {
    assert.equal(isGeoIpEligiblePublicAddress(canonicalizeIp("8.8.8.8")!), true);
  });
});

describe("isGeoIpEligiblePublicAddress — IPv6 2000::/3 Global Unicast gate", () => {
  const outsideGate = ["4000::1", "6000::1", "8000::1", "a000::1", "c000::1", "e000::1", "fe00::1", "fec0::1"];
  for (const ip of outsideGate) {
    test(`${ip} (outside 2000::/3) is not GeoIP-eligible`, () => {
      assert.equal(isGeoIpEligiblePublicAddress(canonicalizeIp(ip)!), false);
    });
  }

  test("a genuine public IPv6 address inside 2000::/3 is eligible", () => {
    assert.equal(isGeoIpEligiblePublicAddress(canonicalizeIp("2001:4860:4860::8888")!), true);
  });
});

describe("isGeoIpEligiblePublicAddress — IPv6 Special-Purpose registry (table-driven)", () => {
  const insideGateCases: [string, string][] = [
    ["2001::1", "IETF Protocol Assignments"],
    ["2001:db8::1", "Documentation"],
    ["2002::1", "6to4"],
    ["2620:4f:8000::1", "Direct Delegation AS112 Service"],
    ["3fff::1", "Documentation (RFC 9637)"],
  ];
  for (const [ip, name] of insideGateCases) {
    test(`${ip} (${name}, inside 2000::/3) is not GeoIP-eligible even though inside the gate`, () => {
      assert.equal(isGeoIpEligiblePublicAddress(canonicalizeIp(ip)!), false);
    });
  }

  const outsideGateCases: [string, string][] = [
    ["::1", "Loopback"],
    ["::", "Unspecified"],
    ["64:ff9b::1", "NAT64 well-known"],
    ["64:ff9b:1::1", "NAT64 local-use"],
    ["100::1", "Discard-Only"],
    ["100:0:0:1::1", "Dummy IPv6 Prefix (RFC 9780)"],
    ["5f00::1", "Segment Routing (SRv6) SIDs"],
    ["fc00::1", "Unique Local"],
    ["fe80::1", "Link-Local Unicast"],
    ["ff00::1", "Multicast"],
  ];
  for (const [ip, name] of outsideGateCases) {
    test(`${ip} (${name}) is not GeoIP-eligible`, () => {
      assert.equal(isGeoIpEligiblePublicAddress(canonicalizeIp(ip)!), false);
    });
  }
});

describe("ingestPayloadSchema", () => {
  test("accepts a well-formed payload", () => {
    const result = ingestPayloadSchema.safeParse({
      source: "claude-app",
      ip: "203.0.113.5",
      method: "GET",
      path: "/lotto",
      userAgent: "curl/8.0",
    });
    assert.equal(result.success, true);
  });

  test("rejects a path containing a query string", () => {
    const result = ingestPayloadSchema.safeParse({
      source: "claude-app",
      ip: "203.0.113.5",
      method: "GET",
      path: "/foo?token=secret",
    });
    assert.equal(result.success, false);
  });

  test("rejects an invalid source name", () => {
    const result = ingestPayloadSchema.safeParse({
      source: "../etc/passwd",
      ip: "203.0.113.5",
      method: "GET",
      path: "/foo",
    });
    assert.equal(result.success, false);
  });
});

describe("mergeIpSummaries", () => {
  test("combines counts, sources, and geo rows by ip", () => {
    const firstSeen = new Date("2026-01-01T00:00:00Z");
    const lastSeen = new Date("2026-01-02T00:00:00Z");
    const merged = mergeIpSummaries(
      [{ ip: "203.0.113.5", hitCount: 3, firstSeen, lastSeen }],
      [
        { ip: "203.0.113.5", source: "claude-app" },
        { ip: "203.0.113.5", source: "pihole" },
      ],
      [{ ip: "203.0.113.5", status: "RESOLVED", country: "KR", city: "Seoul" }],
    );
    assert.deepEqual(merged, [
      {
        ip: "203.0.113.5",
        sources: ["claude-app", "pihole"],
        country: "KR",
        city: "Seoul",
        hitCount: 3,
        firstSeen,
        lastSeen,
      },
    ]);
  });

  test("an ip with no geo row yet shows null country/city", () => {
    const firstSeen = new Date();
    const merged = mergeIpSummaries(
      [{ ip: "203.0.113.6", hitCount: 1, firstSeen, lastSeen: firstSeen }],
      [{ ip: "203.0.113.6", source: "claude-app" }],
      [],
    );
    assert.equal(merged[0].country, null);
    assert.equal(merged[0].city, null);
  });

  test("a NOT_APPLICABLE geo row also shows null country/city, not the status", () => {
    const firstSeen = new Date();
    const merged = mergeIpSummaries(
      [{ ip: "10.0.0.5", hitCount: 1, firstSeen, lastSeen: firstSeen }],
      [{ ip: "10.0.0.5", source: "claude-app" }],
      [{ ip: "10.0.0.5", status: "NOT_APPLICABLE", country: null, city: null }],
    );
    assert.equal(merged[0].country, null);
    assert.equal(merged[0].city, null);
  });
});
