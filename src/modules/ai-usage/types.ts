import type { EntrySource } from "@/generated/prisma/client";

/** Wire/DTO shape — dates are ISO strings, never Prisma Date objects. */
export interface AiUsageEntryDTO {
  id: string;
  metricId: string;
  usagePercent: number;
  note: string | null;
  source: EntrySource;
  recordedAt: string;
  resetsAt: string | null;
  createdAt: string;
}

export type UsageCardState =
  | { kind: "UNSUPPORTED" }
  | { kind: "NO_DATA" }
  | { kind: "OK"; entry: AiUsageEntryDTO }
  | { kind: "STALE"; entry: AiUsageEntryDTO; ageHours: number }
  | { kind: "PERIOD_ENDED"; entry: AiUsageEntryDTO };

export type CardStatesResponse = Record<string, UsageCardState>;
