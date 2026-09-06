// Typed metric registry — no admin UI, no DB table. Add a metric by adding a
// row here; no migration needed since AiUsageEntry.metricId is a plain
// string column validated against this list at the application layer.
//
// Each metric's `resetsAt` is always a value the *user* observed and typed
// in — this app never estimates or computes a reset time from windowHours.
// `windowHours` is a display label only.

export interface UsageMetricDef {
  id: string;
  provider: "anthropic" | "openai";
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
    id: "claude_pro_5h_window",
    provider: "anthropic",
    product: "Claude Pro",
    displayName: "Claude Pro – 5시간 한도",
    supportsNumericInput: true,
    limitPeriod: {
      kind: "fixed_window",
      windowHours: 5,
      resetNote: "claude.ai Settings > Usage에서 표시되는 다음 초기화 시각을 그대로 입력",
    },
  },
  {
    id: "claude_pro_weekly",
    provider: "anthropic",
    product: "Claude Pro",
    displayName: "Claude Pro – 주간 한도(전체 모델)",
    supportsNumericInput: true,
    limitPeriod: {
      kind: "weekly",
      resetNote: "계정별 고정 요일/시각에 매주 초기화, Settings > Usage에서 확인해 입력",
    },
  },
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
  {
    id: "chatgpt_plus_general",
    provider: "openai",
    product: "ChatGPT Plus (일반)",
    displayName: "ChatGPT Plus – 일반 사용량",
    supportsNumericInput: false,
    limitPeriod: {
      kind: "unknown",
      resetNote:
        "기능별 정량 지표가 ChatGPT UI에서 실제로 확인되기 전까지는 수치 입력을 지원하지 않음 — 확인되면 전용 지표로 교체",
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
