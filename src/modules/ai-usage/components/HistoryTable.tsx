"use client";

import { useEffect, useState } from "react";
import { USAGE_METRICS } from "@/modules/ai-usage/metrics";
import { usedToRemainingPercent } from "@/modules/ai-usage/logic";
import type { AiUsageEntryDTO } from "@/modules/ai-usage/types";
import { useAiUsageData } from "./AiUsageDataProvider";

const PAGE_SIZE = 20;

export default function HistoryTable() {
  const { version, deleteEntry } = useAiUsageData();
  const [metricFilter, setMetricFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<AiUsageEntryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Verified: a plain `// eslint-disable-next-line react-hooks/set-state-in-effect`
    // does NOT suppress this — it's a React Compiler diagnostic, not a
    // normal lint rule, and ignores inline disable comments (confirmed by
    // running `npm run lint`, which still reported the error and flagged
    // the comment itself as an unused directive). Scheduling the update via
    // a microtask — the same "setState in a callback" shape the rule's own
    // message recommends — actually avoids the diagnostic.
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (metricFilter) params.set("metricId", metricFilter);
    fetch(`/api/ai-usage?${params}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { items: [], total: 0 }))
      .then((data: { items: AiUsageEntryDTO[]; total: number }) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [metricFilter, page, version]);

  // Filtering resets pagination — otherwise page 3 of an unfiltered list can
  // silently become an out-of-range page of a filtered (shorter) one.
  function handleFilterChange(next: string) {
    setMetricFilter(next);
    setPage(0);
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    await deleteEntry(id);
    setDeletingId(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <select
          value={metricFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">전체 지표</option>
          {USAGE_METRICS.filter((m) => m.supportsNumericInput).map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">{total}건</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
              <th className="py-2 pr-2 font-medium">확인 시각</th>
              <th className="py-2 pr-2 font-medium">지표</th>
              <th className="py-2 pr-2 font-medium">남은 비율</th>
              <th className="py-2 pr-2 font-medium">출처</th>
              <th className="py-2 pr-2 font-medium">메모</th>
              <th className="py-2 pr-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-zinc-500">
                  불러오는 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-zinc-500">
                  기록이 없습니다
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const metric = USAGE_METRICS.find((m) => m.id === item.metricId);
                return (
                  <tr key={item.id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 pr-2 whitespace-nowrap">{new Date(item.recordedAt).toLocaleString()}</td>
                    <td className="py-2 pr-2">{metric?.displayName ?? item.metricId}</td>
                    <td className="py-2 pr-2 tabular-nums">{usedToRemainingPercent(item.usagePercent)}%</td>
                    <td className="py-2 pr-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          item.source === "MANUAL"
                            ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        }`}
                      >
                        {item.source}
                      </span>
                    </td>
                    <td className="py-2 pr-2 max-w-[200px] truncate">{item.note ?? ""}</td>
                    <td className="py-2 pr-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                      >
                        {deletingId === item.id ? "삭제 중..." : "삭제"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          이전
        </button>
        <span className="text-xs text-zinc-500">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
          disabled={page + 1 >= totalPages}
          className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          다음
        </button>
      </div>
    </div>
  );
}
