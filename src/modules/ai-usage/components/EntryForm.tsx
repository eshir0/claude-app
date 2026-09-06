"use client";

import { useState, type FormEvent } from "react";
import { USAGE_METRICS } from "@/modules/ai-usage/metrics";
import { useAiUsageData } from "./AiUsageDataProvider";

const NUMERIC_METRICS = USAGE_METRICS.filter((m) => m.supportsNumericInput);

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function browserTimezoneLabel(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offsetLabel = `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${tz} (${offsetLabel})`;
}

export default function EntryForm() {
  const { createEntry } = useAiUsageData();
  const [metricId, setMetricId] = useState(NUMERIC_METRICS[0]?.id ?? "");
  const [mode, setMode] = useState<"used" | "remaining">("used");
  const [percentInput, setPercentInput] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [resetsAt, setResetsAt] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return; // guards against a double-click double-submit
    setError(null);

    const percentValue = Number(percentInput);
    if (percentInput.trim() === "" || Number.isNaN(percentValue)) {
      setError("사용량 %를 입력하세요.");
      return;
    }
    const usagePercent = mode === "remaining" ? 100 - percentValue : percentValue;

    setSubmitting(true);
    const result = await createEntry({
      metricId,
      usagePercent,
      recordedAt: new Date(recordedAt).toISOString(),
      resetsAt: resetsAt ? new Date(resetsAt).toISOString() : undefined,
      note: note.trim() ? note.trim() : undefined,
    });
    setSubmitting(false);

    if (!result.ok) {
      // Input is deliberately left as-is on failure — nothing is cleared,
      // so the user doesn't retype everything after a transient error.
      setError(result.error);
      return;
    }
    setPercentInput("");
    setNote("");
    setResetsAt("");
    setRecordedAt(toLocalDateTimeInputValue(new Date()));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          지표
          <select
            value={metricId}
            onChange={(e) => setMetricId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {NUMERIC_METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span>사용량</span>
          <div className="flex gap-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "used" | "remaining")}
              className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="used">사용 %</option>
              <option value="remaining">남음 %</option>
            </select>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={percentInput}
              onChange={(e) => setPercentInput(e.target.value)}
              placeholder="0-100"
              className="w-full rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          확인 시각 ({browserTimezoneLabel()})
          <input
            type="datetime-local"
            value={recordedAt}
            onChange={(e) => setRecordedAt(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          초기화 시각 (선택, 모르면 비워둠)
          <input
            type="datetime-local"
            value={resetsAt}
            onChange={(e) => setResetsAt(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        메모 (선택)
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {submitting ? "저장 중..." : "기록 추가"}
      </button>
    </form>
  );
}
