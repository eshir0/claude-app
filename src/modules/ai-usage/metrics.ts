// Typed metric registry — no admin UI, no DB table. Add a metric by adding a
// row here; no migration needed since AiUsageEntry.metricId is a plain
// string column validated against this list at the application layer.
//
// Each metric's `resetsAt` is always a value the *user* observed and typed
// in — this app never estimates or computes a reset time from windowHours.
// `windowHours` is a display label only.

export interface UsageMetricDef {
  id: string;
  provider: "openai";
  product: string;
  displayName: string;
  /** false = no numeric input UI; shown as "수치 확인 미지원" only. */
  supportsNumericInput: boolean;
  limitPeriod: {
    kind: "fixed_window" | "weekly" | "unknown";
    windowHours?: number;
    resetNote: string;
  };
}

export const USAGE_METRICS: readonly UsageMetricDef[] = [
  {
    id: "chatgpt_codex_5h_window",
    provider: "openai",
    product: "ChatGPT Codex",
    displayName: "Codex – 5시간 한도",
    supportsNumericInput: true,
    limitPeriod: {
      kind: "fixed_window",
      windowHours: 5,
      resetNote: "chatgpt.com/codex/settings/usage에서 확인해 입력",
    },
  },
  {
    id: "chatgpt_codex_weekly",
    provider: "openai",
    product: "ChatGPT Codex",
    displayName: "Codex – 주간 한도",
    supportsNumericInput: true,
    limitPeriod: {
      kind: "weekly",
      resetNote: "chatgpt.com/codex/settings/usage에서 확인해 입력",
    },
  },
] as const;

export type UsageMetricId = (typeof USAGE_METRICS)[number]["id"];

export function getMetric(id: string): UsageMetricDef | undefined {
  return USAGE_METRICS.find((m) => m.id === id);
}

export const NUMERIC_METRIC_IDS = USAGE_METRICS.filter(
  (m) => m.supportsNumericInput,
).map((m) => m.id);
