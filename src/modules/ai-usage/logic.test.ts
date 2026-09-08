import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createEntrySchema,
  listEntriesQuerySchema,
  computeCardState,
  compareEntriesNewestFirst,
  usedToRemainingPercent,
  formatResetCountdown,
} from "./logic.ts";
import type { AiUsageEntryDTO } from "./types.ts";

// A recordedAt value that is always safely in the past relative to the real
// wall clock, regardless of what date this suite happens to run on — the
// schema itself rejects future recordedAt values, so any test not
// specifically exercising that rule needs a timestamp that can't drift into
// the future between when this file was written and when it runs.
const SAFE_PAST_ISO = () => new Date(Date.now() - 60 * 1000).toISOString();

function entry(overrides: Partial<AiUsageEntryDTO> = {}): AiUsageEntryDTO {
  return {
    id: "e1",
    metricId: "chatgpt_codex_5h_window",
    usagePercent: 50,
    note: null,
    source: "MANUAL",
    recordedAt: "2026-09-06T10:00:00Z",
    resetsAt: null,
    createdAt: "2026-09-06T10:00:00Z",
    ...overrides,
  };
}

describe("createEntrySchema", () => {
  test("rejects unknown metricId", () => {
    const r = createEntrySchema.safeParse({
      metricId: "not_a_real_metric",
      usagePercent: 50,
      recordedAt: SAFE_PAST_ISO(),
    });
    assert.equal(r.success, false);
  });

  test("rejects usagePercent out of range", () => {
    const bad1 = createEntrySchema.safeParse({
      metricId: "chatgpt_codex_5h_window",
      usagePercent: 101,
      recordedAt: SAFE_PAST_ISO(),
    });
    const bad2 = createEntrySchema.safeParse({
      metricId: "chatgpt_codex_5h_window",
      usagePercent: -1,
      recordedAt: SAFE_PAST_ISO(),
    });
    assert.equal(bad1.success, false);
    assert.equal(bad2.success, false);
  });

  test("rejects empty/missing usagePercent (does not coerce to 0)", () => {
    const r = createEntrySchema.safeParse({
      metricId: "chatgpt_codex_5h_window",
      usagePercent: "" as unknown as number,
      recordedAt: SAFE_PAST_ISO(),
    });
    assert.equal(r.success, false);
  });

  test("rejects a date string with no timezone offset", () => {
    const r = createEntrySchema.safeParse({
      metricId: "chatgpt_codex_5h_window",
      usagePercent: 50,
      recordedAt: "2026-09-06T10:00:00",
    });
    assert.equal(r.success, false);
  });

  test("rejects recordedAt more than 5 minutes in the future", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const r = createEntrySchema.safeParse({
      metricId: "chatgpt_codex_5h_window",
      usagePercent: 50,
      recordedAt: future,
    });
    assert.equal(r.success, false);
  });

  test("allows resetsAt in the future", () => {
    // recordedAt must stay safely in the past relative to the real wall
    // clock (the schema itself checks against Date.now()), independent of
    // whatever date this test happens to run on — a hardcoded absolute
    // recordedAt failed intermittently once the real clock caught up to it.
    const recordedAt = new Date(Date.now() - 60 * 1000);
    const resetsAt = new Date(recordedAt.getTime() + 5 * 60 * 60 * 1000);
    const r = createEntrySchema.safeParse({
      metricId: "chatgpt_codex_5h_window",
      usagePercent: 50,
      recordedAt: recordedAt.toISOString(),
      resetsAt: resetsAt.toISOString(),
    });
    assert.equal(r.success, true);
  });

  test("allows a past recordedAt with a resetsAt also in the past (backfilled record)", () => {
    const r = createEntrySchema.safeParse({
      metricId: "chatgpt_codex_5h_window",
      usagePercent: 50,
      recordedAt: "2020-06-01T10:00:00Z",
      resetsAt: "2020-06-01T15:00:00Z",
    });
    assert.equal(r.success, true);
  });

  test("rejects resetsAt before recordedAt", () => {
    const recordedAt = new Date(Date.now() - 60 * 1000);
    const resetsAt = new Date(recordedAt.getTime() - 60 * 60 * 1000);
    const r = createEntrySchema.safeParse({
      metricId: "chatgpt_codex_5h_window",
      usagePercent: 50,
      recordedAt: recordedAt.toISOString(),
      resetsAt: resetsAt.toISOString(),
    });
    assert.equal(r.success, false);
  });

  test("allows omitted resetsAt and note, stores as undefined not empty-string", () => {
    const r = createEntrySchema.safeParse({
      metricId: "chatgpt_codex_5h_window",
      usagePercent: 50,
      recordedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      resetsAt: "",
      note: "",
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.resetsAt, undefined);
      assert.equal(r.data.note, undefined);
    }
  });

  test("rejects note over 500 chars", () => {
    const r = createEntrySchema.safeParse({
      metricId: "chatgpt_codex_5h_window",
      usagePercent: 50,
      recordedAt: SAFE_PAST_ISO(),
      note: "a".repeat(501),
    });
    assert.equal(r.success, false);
  });
});

describe("listEntriesQuerySchema", () => {
  test("applies defaults when params are absent", () => {
    const r = listEntriesQuerySchema.safeParse({});
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.limit, 20);
      assert.equal(r.data.offset, 0);
    }
  });

  test("rejects limit above the max", () => {
    const r = listEntriesQuerySchema.safeParse({ limit: "1000" });
    assert.equal(r.success, false);
  });

  test("rejects from > to", () => {
    const r = listEntriesQuerySchema.safeParse({
      from: "2026-09-06T10:00:00Z",
      to: "2026-09-01T10:00:00Z",
    });
    assert.equal(r.success, false);
  });
});

describe("usedToRemainingPercent", () => {
  test("converts used % to remaining %", () => {
    assert.equal(usedToRemainingPercent(20), 80);
    assert.equal(usedToRemainingPercent(0), 100);
    assert.equal(usedToRemainingPercent(100), 0);
  });
});

describe("formatResetCountdown", () => {
  const now = new Date("2026-09-07T12:00:00Z");

  test("minutes only under an hour away", () => {
    assert.equal(formatResetCountdown("2026-09-07T12:45:00Z", now), "45분 후 초기화");
  });
  test("hours and minutes under a day away", () => {
    assert.equal(formatResetCountdown("2026-09-07T15:20:00Z", now), "3시간 20분 후 초기화");
  });
  test("days and hours at/above a day away", () => {
    assert.equal(formatResetCountdown("2026-09-09T16:00:00Z", now), "2일 4시간 후 초기화");
  });
  test("already past resetsAt", () => {
    assert.equal(formatResetCountdown("2026-09-07T11:00:00Z", now), "초기화 시각 지남");
    assert.equal(formatResetCountdown("2026-09-07T12:00:00Z", now), "초기화 시각 지남");
  });
});

describe("compareEntriesNewestFirst", () => {
  test("sorts by recordedAt descending regardless of insertion/createdAt order", () => {
    const older = entry({ id: "a", recordedAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-06T00:00:00Z" });
    const newer = entry({ id: "b", recordedAt: "2026-09-05T00:00:00Z", createdAt: "2026-09-02T00:00:00Z" });
    const sorted = [older, newer].sort(compareEntriesNewestFirst);
    assert.equal(sorted[0].id, "b");
  });

  test("tie-breaks identical recordedAt by createdAt descending, then id descending", () => {
    const a = entry({ id: "a", recordedAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" });
    const b = entry({ id: "b", recordedAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-02T00:00:00Z" });
    const sorted = [a, b].sort(compareEntriesNewestFirst);
    assert.equal(sorted[0].id, "b");

    const c = entry({ id: "c", recordedAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" });
    const d = entry({ id: "d", recordedAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" });
    const sortedTie = [c, d].sort(compareEntriesNewestFirst);
    assert.equal(sortedTie[0].id, "d"); // 'd' > 'c' lexicographically, deterministic
  });
});

describe("computeCardState", () => {
  const now = new Date("2026-09-06T12:00:00Z");

  test("UNSUPPORTED for a metric with supportsNumericInput: false", () => {
    const state = computeCardState("chatgpt_plus_general", [], now);
    assert.equal(state.kind, "UNSUPPORTED");
  });

  test("NO_DATA when there are zero entries for a supported metric", () => {
    const state = computeCardState("chatgpt_codex_5h_window", [], now);
    assert.equal(state.kind, "NO_DATA");
  });

  test("OK for a recent entry with no resetsAt", () => {
    const e = entry({ recordedAt: "2026-09-06T11:00:00Z" });
    const state = computeCardState("chatgpt_codex_5h_window", [e], now);
    assert.equal(state.kind, "OK");
  });

  test("PERIOD_ENDED takes priority over STALE when both conditions hold", () => {
    // recordedAt is very old (would be STALE) AND resetsAt is in the past.
    const e = entry({
      recordedAt: "2026-08-01T00:00:00Z",
      resetsAt: "2026-08-01T05:00:00Z",
    });
    const state = computeCardState("chatgpt_codex_5h_window", [e], now);
    assert.equal(state.kind, "PERIOD_ENDED");
  });

  test("STALE when recordedAt is older than the metric's threshold and resetsAt is unknown", () => {
    // fixed_window, windowHours=5 -> stale threshold = 10h. 40h old triggers it.
    const e = entry({ recordedAt: "2026-09-04T20:00:00Z", resetsAt: null });
    const state = computeCardState("chatgpt_codex_5h_window", [e], now);
    assert.equal(state.kind, "STALE");
  });

  test("a backdated (older) entry never overrides an already-newer entry as 'latest'", () => {
    const newer = entry({ id: "newer", recordedAt: "2026-09-06T11:00:00Z" });
    const olderAddedLater = entry({ id: "older", recordedAt: "2026-09-01T00:00:00Z" });
    // Simulate service.ts behavior: always sort before computing card state.
    const sorted = [olderAddedLater, newer].sort(compareEntriesNewestFirst);
    const state = computeCardState("chatgpt_codex_5h_window", sorted, now);
    assert.equal(state.kind, "OK");
    if (state.kind === "OK") assert.equal(state.entry.id, "newer");
  });
});
