import "server-only";

// ipwho.is: free, no API key, HTTPS (unlike ip-api.com's free tier, which
// is HTTP-only) — see the module's plan doc for the trade-off (no bulk
// endpoint, 1,000 requests/day) and why HTTPS won out over throughput for
// this project's low, all-background lookup volume.

const REQUEST_TIMEOUT_MS = 5_000;

export type IpGeoOutcome = "resolved" | "not_applicable" | "failed" | "rate_limited";

export interface IpGeoLookupResult {
  outcome: IpGeoOutcome;
  country: string | null;
  city: string | null;
  /** Only meaningful when outcome === "rate_limited". */
  retryAfterMs: number | null;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

export async function fetchIpGeo(ip: string): Promise<IpGeoLookupResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: controller.signal });
    if (res.status === 429) {
      return {
        outcome: "rate_limited",
        country: null,
        city: null,
        retryAfterMs: parseRetryAfterMs(res.headers.get("retry-after")),
      };
    }
    if (!res.ok) {
      return { outcome: "failed", country: null, city: null, retryAfterMs: null };
    }
    const body: unknown = await res.json();
    const obj = body as { success?: boolean; country?: unknown; city?: unknown } | null;
    // ipwho.is reports a bad/reserved-range query as `success: false` rather
    // than an HTTP error status. Our own isGeoIpEligiblePublicAddress()
    // check runs before this is ever called, so this should be unreachable
    // in practice — kept as defense-in-depth against a classifier gap,
    // treated the same as our own NOT_APPLICABLE rather than a retryable
    // failure.
    if (!obj || obj.success === false) {
      return { outcome: "not_applicable", country: null, city: null, retryAfterMs: null };
    }
    return {
      outcome: "resolved",
      country: typeof obj.country === "string" ? obj.country : null,
      city: typeof obj.city === "string" ? obj.city : null,
      retryAfterMs: null,
    };
  } catch {
    return { outcome: "failed", country: null, city: null, retryAfterMs: null };
  } finally {
    clearTimeout(timeout);
  }
}
