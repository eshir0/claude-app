import "server-only";

// In-memory, single-instance login rate limiting. Resets on restart — an
// accepted limitation for a single-user personal app (see README).
//
// App Router's Request/NextRequest does not expose the real socket address,
// and NextRequest.ip was removed — there is no framework-level way to read
// "the true client IP" from inside a route handler. So this only trusts a
// header at all when BOTH of these are explicitly configured, which is only
// safe when the deployment guarantees a trusted reverse proxy overwrites
// that header before the request reaches this app (see .env.example and
// README "Login rate limiting"):
//   TRUSTED_PROXY=true
//   CLIENT_IP_HEADER=X-Forwarded-For
// Without both set, rate limiting falls back to one server-wide bucket
// rather than silently disabling itself.

const WINDOW_MS = 60_000;
const MAX_FAILURES_PER_WINDOW = 5;
const LOCKOUT_MS = 60_000;
const GLOBAL_KEY = "__global__";

interface Bucket {
  failureTimestamps: number[];
  lockedUntil: number;
}

const buckets = new Map<string, Bucket>();

function getBucket(key: string): Bucket {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { failureTimestamps: [], lockedUntil: 0 };
    buckets.set(key, bucket);
  }
  return bucket;
}

function pruneOld(bucket: Bucket, now: number) {
  const cutoff = now - WINDOW_MS;
  bucket.failureTimestamps = bucket.failureTimestamps.filter((t) => t > cutoff);
}

export function getRateLimitKey(req: Request): string {
  const trustedProxyConfigured = process.env.TRUSTED_PROXY === "true";
  const headerName = process.env.CLIENT_IP_HEADER;
  if (trustedProxyConfigured && headerName) {
    const value = req.headers.get(headerName);
    if (value && value.trim()) return `ip:${value.trim()}`;
  }
  return GLOBAL_KEY;
}

export function isLockedOut(key: string, now = Date.now()): boolean {
  const bucket = getBucket(key);
  pruneOld(bucket, now);
  return now < bucket.lockedUntil;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const bucket = getBucket(key);
  pruneOld(bucket, now);
  bucket.failureTimestamps.push(now);
  if (bucket.failureTimestamps.length >= MAX_FAILURES_PER_WINDOW) {
    bucket.lockedUntil = now + LOCKOUT_MS;
  }
}

export function recordLoginSuccess(key: string): void {
  buckets.delete(key);
}
