"use client";

import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { USAGE_METRICS } from "@/modules/ai-usage/metrics";
import { usedToRemainingPercent } from "@/modules/ai-usage/logic";
import type { AiUsageEntryDTO } from "@/modules/ai-usage/types";
import { useAiUsageData } from "./AiUsageDataProvider";

const NUMERIC_METRICS = USAGE_METRICS.filter((m) => m.supportsNumericInput);
const RANGES = [
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "90d", label: "90일" },
  { value: "all", label: "전체" },
] as const;

export default function UsageChart() {
  const { version } = useAiUsageData();
  const [metricId, setMetricId] = useState(NUMERIC_METRICS[0]?.id ?? "");
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>("30d");
  const [points, setPoints] = useState<AiUsageEntryDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!metricId) return;
    let cancelled = false;
    // See HistoryTable.tsx for why this is a microtask, not a disable comment.
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    const params = new URLSearchParams({ metricId, range });
    fetch(`/api/ai-usage/chart?${params}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AiUsageEntryDTO[]) => {
        if (!cancelled) setPoints(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `version` (bumped on every create/delete) is an intentional dependency
    // — a chart showing stale data right after a save/delete would be worse
    // than one extra fetch.
  }, [metricId, range, version]);

  const chartData = points.map((p) => ({
    x: new Date(p.recordedAt).getTime(),
    label: new Date(p.recordedAt).toLocaleString(),
    remainingPercent: usedToRemainingPercent(p.usagePercent),
  }));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={metricId}
          onChange={(e) => setMetricId(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {NUMERIC_METRICS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={`rounded px-2 py-1 text-xs ${
                range === r.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-zinc-500">불러오는 중...</div>
      ) : chartData.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-zinc-500">이 기간에 기록이 없습니다</div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="x"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v: number) => new Date(v).toLocaleDateString()}
                fontSize={12}
              />
              <YAxis domain={[0, 100]} fontSize={12} />
              <Tooltip
                labelFormatter={(v) => (typeof v === "number" ? new Date(v).toLocaleString() : String(v))}
                formatter={(value) => [`${value}%`, "남은 비율"]}
                contentStyle={{ backgroundColor: "#27272a", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#fafafa", fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: "#fafafa" }}
              />
              <Line
                type="linear"
                dataKey="remainingPercent"
                stroke="#3f3f46"
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        점 사이를 잇는 선은 가독성을 위한 것이며, 관측하지 않은 구간의 실제 값을 나타내지 않습니다.
      </p>
    </div>
  );
}
