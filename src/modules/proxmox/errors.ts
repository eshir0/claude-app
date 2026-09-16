// Pure function only — no server-only, no Node APIs — so unit tests can
// import this directly. client.ts (server-only) is the only caller.

// pveproxy recycles its worker processes continuously as part of normal
// operation (observed live: a worker can exit and be replaced within
// 1-2 seconds, many times an hour) — a request that happens to land in
// that narrow gap gets a raw connection-level failure (EPROTO, ECONNRESET,
// "socket disconnected before secure TLS connection was established"),
// not a real outage. Used both to decide whether to retry (client.ts) and
// whether to show a plain-language message instead of the raw error
// (the /api/proxmox/status route).
export function isTransientNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPROTO|EHOSTUNREACH|ENETUNREACH|socket disconnected/i.test(message);
}
