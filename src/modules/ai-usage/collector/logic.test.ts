import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { shouldRefresh, mapCodexUsageToEntries, mapOmnirouteClaudeUsageToEntries } from "./logic.ts";

describe("shouldRefresh", () => {
  test("false when well before expiry", () => {
    const now = 1_000_000;
    assert.equal(shouldRefresh(now + 10 * 60_000, now), false);
  });

  test("true once inside the refresh margin", () => {
    const now = 1_000_000;
    assert.equal(shouldRefresh(now + 30_000, now), true);
  });

  test("true exactly at the margin boundary", () => {
    const now = 1_000_000;
    assert.equal(shouldRefresh(now + 60_000, now), true);
  });

  test("true when already expired", () => {
    const now = 1_000_000;
    assert.equal(shouldRefresh(now - 1, now), true);
  });
});

describe("mapCodexUsageToEntries", () => {
  // A real response body observed from /backend-api/wham/usage
  // (2026-09-07) — not a fabricated fixture.
  const REAL_RESPONSE = {
    rate_limit: {
      primary_window: {
        used_percent: 36,
        limit_window_seconds: 18000,
        reset_after_seconds: 3231,
        reset_at: 1788780663,
      },
      secondary_window: {
        used_percent: 24,
        limit_window_seconds: 604800,
        reset_after_seconds: 439096,
        reset_at: 1789216528,
      },
    },
  };

  test("maps the 5h window (18000s) to chatgpt_codex_5h_window", () => {
    const entries = mapCodexUsageToEntries(REAL_RESPONSE);
    const fiveHour = entries.find((e) => e.metricId === "chatgpt_codex_5h_window");
    assert.ok(fiveHour);
    assert.equal(fiveHour.usagePercent, 36);
    assert.equal(fiveHour.resetsAt.getTime(), 1788780663 * 1000);
  });

  test("maps the weekly window (604800s) to chatgpt_codex_weekly", () => {
    const entries = mapCodexUsageToEntries(REAL_RESPONSE);
    const weekly = entries.find((e) => e.metricId === "chatgpt_codex_weekly");
    assert.ok(weekly);
    assert.equal(weekly.usagePercent, 24);
    assert.equal(weekly.resetsAt.getTime(), 1789216528 * 1000);
  });

  test("skips a window with an unrecognized length rather than guessing", () => {
    const entries = mapCodexUsageToEntries({
      rate_limit: {
        primary_window: { used_percent: 50, limit_window_seconds: 3600, reset_after_seconds: 100, reset_at: 1 },
      },
    });
    assert.deepEqual(entries, []);
  });

  test("returns an empty array when rate_limit is missing entirely", () => {
    assert.deepEqual(mapCodexUsageToEntries({}), []);
  });

  test("clamps an out-of-range used_percent into 0-100", () => {
    const entries = mapCodexUsageToEntries({
      rate_limit: {
        primary_window: { used_percent: 104, limit_window_seconds: 18000, reset_after_seconds: 1, reset_at: 1 },
      },
    });
    assert.equal(entries[0].usagePercent, 100);
  });
});

describe("mapOmnirouteClaudeUsageToEntries", () => {
  // A real response body observed from a self-hosted OmniRoute instance's
  // GET /api/usage/{connectionId} (2026-09-11, Claude Pro connection) — not
  // a fabricated fixture.
  const REAL_RESPONSE = {
    plan: "default_claude_ai",
    quotas: {
      "session (5h)": {
        used: 61,
        total: 100,
        remaining: 39,
        resetAt: "2026-09-11T09:00:01.004Z",
        remainingPercentage: 39,
        unlimited: false,
      },
      "weekly (7d)": {
        used: 76,
        total: 100,
        remaining: 24,
        resetAt: "2026-09-15T21:00:01.004Z",
        remainingPercentage: 24,
        unlimited: false,
      },
    },
  };

  test("maps a 'session (...)' key to claude_pro_5h_window", () => {
    const entries = mapOmnirouteClaudeUsageToEntries(REAL_RESPONSE);
    const fiveHour = entries.find((e) => e.metricId === "claude_pro_5h_window");
    assert.ok(fiveHour);
    assert.equal(fiveHour.usagePercent, 61);
    assert.equal(fiveHour.resetsAt.toISOString(), "2026-09-11T09:00:01.004Z");
  });

  test("maps a 'weekly (...)' key to claude_pro_weekly", () => {
    const entries = mapOmnirouteClaudeUsageToEntries(REAL_RESPONSE);
    const weekly = entries.find((e) => e.metricId === "claude_pro_weekly");
    assert.ok(weekly);
    assert.equal(weekly.usagePercent, 76);
    assert.equal(weekly.resetsAt.toISOString(), "2026-09-15T21:00:01.004Z");
  });

  test("also matches a plain 'session'/'weekly' key (no window suffix), observed on another provider", () => {
    const entries = mapOmnirouteClaudeUsageToEntries({
      quotas: {
        session: { used: 5, total: 100, resetAt: "2026-09-11T09:29:52.000Z", unlimited: false },
        weekly: { used: 100, total: 100, resetAt: "2026-09-15T04:10:00.000Z", unlimited: false },
      },
    });
    assert.equal(entries.find((e) => e.metricId === "claude_pro_5h_window")?.usagePercent, 5);
    assert.equal(entries.find((e) => e.metricId === "claude_pro_weekly")?.usagePercent, 100);
  });

  test("skips a quota key that matches neither prefix", () => {
    const entries = mapOmnirouteClaudeUsageToEntries({
      quotas: { daily: { used: 10, total: 100, resetAt: "2026-09-12T00:00:00.000Z", unlimited: false } },
    });
    assert.deepEqual(entries, []);
  });

  test("skips an unlimited quota rather than dividing by a meaningless total", () => {
    const entries = mapOmnirouteClaudeUsageToEntries({
      quotas: { session: { used: 0, total: 0, resetAt: "2026-09-12T00:00:00.000Z", unlimited: true } },
    });
    assert.deepEqual(entries, []);
  });

  test("returns an empty array when quotas is missing entirely", () => {
    assert.deepEqual(mapOmnirouteClaudeUsageToEntries({}), []);
  });

  test("computes usagePercent from used/total rather than assuming total is always 100", () => {
    const entries = mapOmnirouteClaudeUsageToEntries({
      quotas: { session: { used: 1, total: 4, resetAt: "2026-09-12T00:00:00.000Z", unlimited: false } },
    });
    assert.equal(entries[0].usagePercent, 25);
  });
});
