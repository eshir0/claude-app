import "server-only";
import { prisma } from "@/lib/prisma";
import type { AiUsageEntry, EntrySource } from "@/generated/prisma/client";
import { USAGE_METRICS } from "./metrics";
import {
  type CreateEntryInput,
  compareEntriesNewestFirst,
  computeCardState,
  rangeToFromDate,
  type ChartRange,
} from "./logic";
import type { AiUsageEntryDTO, CardStatesResponse } from "./types";

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

export async function getChartData(metricId: string, range: ChartRange): Promise<AiUsageEntryDTO[]> {
  const from = rangeToFromDate(range);
  const rows = await prisma.aiUsageEntry.findMany({
    where: {
      metricId,
      ...(from ? { recordedAt: { gte: from } } : {}),
    },
    orderBy: [{ recordedAt: "asc" }],
  });
  return rows.map(toDTO);
}

/**
 * One card state per registered metric (including UNSUPPORTED ones). Groups
 * and sorts in memory — the dataset is a single person's usage log, not a
 * multi-tenant table, so this stays cheap without a more clever query.
 */
export async function getCardStates(now: Date = new Date()): Promise<CardStatesResponse> {
  const numericMetricIds = USAGE_METRICS.filter((m) => m.supportsNumericInput).map((m) => m.id);
  const rows = await prisma.aiUsageEntry.findMany({
    where: { metricId: { in: numericMetricIds } },
  });
  const byMetric = new Map<string, AiUsageEntryDTO[]>();
  for (const row of rows) {
    const dto = toDTO(row);
    const list = byMetric.get(dto.metricId);
    if (list) list.push(dto);
    else byMetric.set(dto.metricId, [dto]);
  }
  const result: CardStatesResponse = {};
  for (const metric of USAGE_METRICS) {
    const sorted = (byMetric.get(metric.id) ?? []).sort(compareEntriesNewestFirst);
    result[metric.id] = computeCardState(metric.id, sorted, now);
  }
  return result;
}
