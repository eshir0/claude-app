import "server-only";
import { prisma } from "@/lib/prisma";
import type { AiUsageEntry, EntrySource } from "@/generated/prisma/client";
import { USAGE_METRICS } from "./metrics";
import {
  type CreateEntryInput,
  computeCardState,
  rangeToFromDate,
  downsampleLttb,
  CHART_MAX_POINTS,
  type ChartRange,
} from "./logic";
import type { AiUsageEntryDTO, CardStatesResponse, ChartPointDTO } from "./types";

// This is the ONLY module that touches Prisma for AI usage data. Manual
// entry (via the API route) and the OpenAI/Codex collector both go through
// createUsageEntry() — CreateEntryInput itself has no `source` field (a
// client HTTP request body can never smuggle one in), so `source` is
// always an explicit argument supplied by server-side code only: the
// manual-entry route passes nothing (defaults to MANUAL), the collector
// passes "AUTO" explicitly.

function toDTO(row: AiUsageEntry): AiUsageEntryDTO {
  return {
    id: row.id,
    metricId: row.metricId,
    usagePercent: row.usagePercent,
    note: row.note,
    source: row.source,
    recordedAt: row.recordedAt.toISOString(),
    resetsAt: row.resetsAt ? row.resetsAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createUsageEntry(
  input: CreateEntryInput,
  source: EntrySource = "MANUAL",
): Promise<AiUsageEntryDTO> {
  const row = await prisma.aiUsageEntry.create({
    data: {
      metricId: input.metricId,
      usagePercent: input.usagePercent,
      note: input.note ?? null,
      recordedAt: new Date(input.recordedAt),
      resetsAt: input.resetsAt ? new Date(input.resetsAt) : null,
      source,
    },
  });
  return toDTO(row);
}

export async function listUsageEntries(params: {
  metricId?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}): Promise<{ items: AiUsageEntryDTO[]; total: number }> {
  const where = {
    ...(params.metricId ? { metricId: params.metricId } : {}),
    ...(params.from || params.to
      ? {
          recordedAt: {
            ...(params.from ? { gte: new Date(params.from) } : {}),
            ...(params.to ? { lte: new Date(params.to) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.aiUsageEntry.findMany({
      where,
      // "Latest first" is always recordedAt, never insertion order — with a
      // deterministic tiebreak, matching compareEntriesNewestFirst exactly.
      orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: params.limit,
      skip: params.offset,
    }),
    prisma.aiUsageEntry.count({ where }),
  ]);
  return { items: rows.map(toDTO), total };
}

export async function deleteUsageEntry(id: string): Promise<void> {
  try {
    await prisma.aiUsageEntry.delete({ where: { id } });
  } catch (err) {
    // P2025 = record not found — deleting an already-gone id is a no-op,
    // not an error (avoids a spurious 500 on a double-click delete).
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") return;
    throw err;
  }
}

export async function getChartData(metricId: string, range: ChartRange): Promise<ChartPointDTO[]> {
  const from = rangeToFromDate(range);
  const rows = await prisma.aiUsageEntry.findMany({
    where: {
      metricId,
      ...(from ? { recordedAt: { gte: from } } : {}),
    },
    orderBy: [{ recordedAt: "asc" }],
  });
  // The collector adds a point every few minutes, so a 30-day range was
  // ~1,500 full rows per metric (~250KB of JSON, four requests per page
  // view). The chart only plots recordedAt/usagePercent: send just those,
  // and a shape-preserving subset of the real rows (see CHART_MAX_POINTS).
  const sampled = downsampleLttb(
    rows,
    CHART_MAX_POINTS,
    (r) => r.recordedAt.getTime(),
    (r) => r.usagePercent,
  );
  return sampled.map((r) => ({ recordedAt: r.recordedAt.toISOString(), usagePercent: r.usagePercent }));
}

/**
 * One card state per registered metric (including UNSUPPORTED ones).
 * computeCardState only ever looks at the newest entry, so this reads just
 * that one row per metric (index-backed) instead of the whole history —
 * which grows by ~170 rows/day from the collector and was being loaded in
 * full on every card refresh. The orderBy matches compareEntriesNewestFirst
 * (same tie-break as listUsageEntries).
 */
export async function getCardStates(now: Date = new Date()): Promise<CardStatesResponse> {
  const numericMetricIds = USAGE_METRICS.filter((m) => m.supportsNumericInput).map((m) => m.id);
  const latestRows = await Promise.all(
    numericMetricIds.map((metricId) =>
      prisma.aiUsageEntry.findFirst({
        where: { metricId },
        orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      }),
    ),
  );
  const latestByMetric = new Map<string, AiUsageEntryDTO>();
  for (const row of latestRows) {
    if (row) latestByMetric.set(row.metricId, toDTO(row));
  }
  const result: CardStatesResponse = {};
  for (const metric of USAGE_METRICS) {
    const latest = latestByMetric.get(metric.id);
    result[metric.id] = computeCardState(metric.id, latest ? [latest] : [], now);
  }
  return result;
}
