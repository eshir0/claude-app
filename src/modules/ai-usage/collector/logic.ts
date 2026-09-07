// Pure functions only — no server-only, no DB, no network — so unit tests
// can import this directly.

const REFRESH_MARGIN_MS = 60_000;

/** True when a token expiring at `expiresAt` should be refreshed before use,
 * given the current time `now` — refresh proactively rather than waiting
 * for an actual 401, with a margin to absorb request latency + clock skew. */
export function shouldRefresh(expiresAt: number, now: number): boolean {
  return now >= expiresAt - REFRESH_MARGIN_MS;
}

// Shape confirmed directly against a real /backend-api/wham/usage response
// (2026-09-07, plan_type "plus") — not guessed. Only the fields this app
// actually uses are typed; the real response has more (model_usage,
// credits, spend_control, ...) that this app doesn't track.
export interface CodexRateLimitWindow {
  used_percent: number;
  limit_window_seconds: number;
  reset_after_seconds: number;
  /** Unix epoch SECONDS (not ms) — confirmed by the observed value's
   * magnitude (10 digits), matches OpenAI's usual epoch-seconds convention. */
  reset_at: number;
}

export interface CodexUsageResponseBody {
  rate_limit?: {
    primary_window?: CodexRateLimitWindow | null;
    secondary_window?: CodexRateLimitWindow | null;
  } | null;
}

export interface MappedUsageEntry {
  metricId: "chatgpt_codex_5h_window" | "chatgpt_codex_weekly";
  usagePercent: number;
  resetsAt: Date;
}

const FIVE_HOURS_SECONDS = 5 * 60 * 60; // 18000 — matches the observed primary_window
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60; // 604800 — matches the observed secondary_window

/**
 * Maps the two rate-limit windows to this app's metrics by matching
 * `limit_window_seconds` against the actual observed values, rather than
 * assuming primary=5h/secondary=weekly by position — if OpenAI ever adds or
 * reorders windows, an unrecognized window length is skipped rather than
 * silently mislabeled as the wrong metric.
 */
export function mapCodexUsageToEntries(body: unknown): MappedUsageEntry[] {
  const b = (body ?? {}) as CodexUsageResponseBody;
  const windows = [b.rate_limit?.primary_window, b.rate_limit?.secondary_window].filter(
    (w): w is CodexRateLimitWindow => w != null && typeof w.used_percent === "number",
  );
  const entries: MappedUsageEntry[] = [];
  for (const w of windows) {
    const metricId =
      w.limit_window_seconds === FIVE_HOURS_SECONDS
        ? "chatgpt_codex_5h_window"
        : w.limit_window_seconds === SEVEN_DAYS_SECONDS
          ? "chatgpt_codex_weekly"
          : null;
    if (!metricId) continue;
    entries.push({
      metricId,
      usagePercent: Math.max(0, Math.min(100, w.used_percent)),
      resetsAt: new Date(w.reset_at * 1000),
    });
  }
  return entries;
}
