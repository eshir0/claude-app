// Deliberately NOT `server-only` — no DB access here, only pure functions and
// zod schemas. service.ts (server-only) calls into this file; unit tests
// import this file directly without needing a server-only bypass.
import { z } from "zod";
import { NUMERIC_METRIC_IDS, getMetric, type UsageMetricDef } from "./metrics.ts";
import type { AiUsageEntryDTO, UsageCardState } from "./types.ts";

const CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_NOTE_LENGTH = 500;
const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 20;

// Reject anything before the app's own epoch as "too far in the past" —
// prevents obviously-wrong dates (typos, epoch-0 bugs) without guessing at
// a "real" lower bound per service.
const EARLIEST_PLAUSIBLE_DATE = new Date("2020-01-01T00:00:00Z");

const isoDateTime = z.iso.datetime({ offset: true });

function toUndefinedIfEmpty(v: unknown) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

export const createEntrySchema = z
  .object({
    metricId: z.enum(NUMERIC_METRIC_IDS as [string, ...string[]]),
    usagePercent: z.number().min(0).max(100),
    recordedAt: isoDateTime,
    resetsAt: z.preprocess(toUndefinedIfEmpty, isoDateTime.optional()),
    note: z.preprocess(toUndefinedIfEmpty, z.string().max(MAX_NOTE_LENGTH).optional()),
  })
  .superRefine((val, ctx) => {
    const recordedAt = new Date(val.recordedAt);
    const now = Date.now();
    if (recordedAt.getTime() > now + CLOCK_SKEW_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["recordedAt"],
        message: "recordedAt cannot be in the future (beyond a 5 minute clock-skew allowance)",
      });
    }
    if (recordedAt.getTime() < EARLIEST_PLAUSIBLE_DATE.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["recordedAt"],
        message: "recordedAt is implausibly far in the past",
      });
    }
    if (val.resetsAt !== undefined) {
      const resetsAt = new Date(val.resetsAt);
      // resetsAt MAY be in the future (that's the normal case) and MAY be in
      // the past (when backfilling an old observation) — the only rule is
      // that it must be after the observation it belongs to.
      if (resetsAt.getTime() <= recordedAt.getTime()) {
        ctx.addIssue({
          code: "custom",
          path: ["resetsAt"],
          message: "resetsAt must be after recordedAt",
        });
      }
    }
  });

export type CreateEntryInput = z.infer<typeof createEntrySchema>;

/**
 * Display-only conversion: the DB and every collector always store/produce
 * "percent USED" (see AiUsageEntry.usagePercent's own doc comment) — this
 * never changes, so historical data and the collector's math stay simple.
 * UI components that want to show "percent REMAINING" instead convert at
 * render time with this, rather than storing a different quantity.
 */
export function usedToRemainingPercent(usedPercent: number): number {
  return 100 - usedPercent;
}

/** Compact "M/D HH:mm" label for chart axis ticks — a date-only tick can't
 * distinguish two points recorded hours apart on the same day. Uses the
 * viewer's local time, in Date's own local getters (not UTC). */
export function formatAxisTick(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * "N시간 M분 후 초기화" style countdown to a known resetsAt — `now` is
 * injectable for deterministic tests. Never fabricates a reset time itself;
 * only formats one that was actually recorded (see AiUsageEntry.resetsAt).
 */
export function formatResetCountdown(resetsAtIso: string, now: Date = new Date()): string {
  const diffMs = new Date(resetsAtIso).getTime() - now.getTime();
  if (diffMs <= 0) return "초기화 시각 지남";

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}일 ${hours}시간 후 초기화`;
  if (hours > 0) return `${hours}시간 ${minutes}분 후 초기화`;
  return `${minutes}분 후 초기화`;
}

const optionalTrimmedString = z.preprocess(toUndefinedIfEmpty, z.string().optional());

export const listEntriesQuerySchema = z
  .object({
    metricId: optionalTrimmedString,
    from: z.preprocess(toUndefinedIfEmpty, isoDateTime.optional()),
    to: z.preprocess(toUndefinedIfEmpty, isoDateTime.optional()),
    limit: z.preprocess(
      toUndefinedIfEmpty,
      z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
    ),
    offset: z.preprocess(toUndefinedIfEmpty, z.coerce.number().int().min(0).optional()),
  })
  .transform((val) => ({
    metricId: val.metricId,
    from: val.from,
    to: val.to,
    limit: val.limit ?? DEFAULT_LIST_LIMIT,
    offset: val.offset ?? 0,
  }))
  .superRefine((val, ctx) => {
    if (val.from && val.to && new Date(val.from).getTime() > new Date(val.to).getTime()) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "from must be <= to" });
    }
  });

export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>;

const CHART_RANGES = ["7d", "30d", "90d", "all"] as const;
export const chartQuerySchema = z.object({
  metricId: z.string(),
  range: z.enum(CHART_RANGES).default("30d"),
});
export type ChartRange = (typeof CHART_RANGES)[number];

export function rangeToFromDate(range: ChartRange, now = new Date()): Date | undefined {
  const days = { "7d": 7, "30d": 30, "90d": 90, all: undefined }[range];
  if (days === undefined) return undefined;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Deterministic ordering: most recent OBSERVATION first, tie-broken so that
 * insertion order never silently decides which entry counts as "latest". */
export function compareEntriesNewestFirst(a: AiUsageEntryDTO, b: AiUsageEntryDTO): number {
  const recordedDiff = new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime();
  if (recordedDiff !== 0) return recordedDiff;
  const createdDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (createdDiff !== 0) return createdDiff;
  return b.id.localeCompare(a.id);
}

const STALE_THRESHOLD_HOURS: Record<UsageMetricDef["limitPeriod"]["kind"], (m: UsageMetricDef) => number> = {
  fixed_window: (m) => (m.limitPeriod.windowHours ?? 24) * 2,
  weekly: () => 8 * 24,
  unknown: () => 7 * 24,
};

/**
 * Priority (first match wins): UNSUPPORTED > NO_DATA > PERIOD_ENDED > STALE > OK.
 * `now` is injectable for deterministic tests.
 */
export function computeCardState(
  metricId: string,
  entriesNewestFirst: readonly AiUsageEntryDTO[],
  now: Date = new Date(),
): UsageCardState {
  const metric = getMetric(metricId);
  if (!metric || !metric.supportsNumericInput) {
    return { kind: "UNSUPPORTED" };
  }
  const latest = entriesNewestFirst[0];
  if (!latest) {
    return { kind: "NO_DATA" };
  }
  if (latest.resetsAt && new Date(latest.resetsAt).getTime() <= now.getTime()) {
    return { kind: "PERIOD_ENDED", entry: latest };
  }
  const ageHours = (now.getTime() - new Date(latest.recordedAt).getTime()) / (60 * 60 * 1000);
  const staleThreshold = STALE_THRESHOLD_HOURS[metric.limitPeriod.kind](metric);
  if (ageHours > staleThreshold) {
    return { kind: "STALE", entry: latest, ageHours };
  }
  return { kind: "OK", entry: latest };
}
