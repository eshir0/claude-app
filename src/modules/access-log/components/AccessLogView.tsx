"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { IpSummaryDTO, AccessLogEntryDTO } from "../types";

interface AccessLogViewProps {
  initialSummaries: IpSummaryDTO[];
  /** Only IPs with at least this many hits are fetched/shown — used by the
   * home-page widget so low-traffic IPs stay out of the home screen and
   * only appear on the full /access-log page. 0 (default) shows everything. */
  minHitCount?: number;
  /** Optional caption shown next to the unique-IP count, e.g. explaining
   * why some IPs are missing here (see AccessLogHomeWidget). */
  note?: string;
}

export function AccessLogView({ initialSummaries, minHitCount = 0, note }: AccessLogViewProps) {
  const [summaries, setSummaries] = useState(initialSummaries);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIp, setExpandedIp] = useState<string | null>(null);
  const [deletingIp, setDeletingIp] = useState<string | null>(null);

  async function handleDelete(ip: string) {
    if (deletingIp) return;
    if (!window.confirm(`${ip} 접속 기록을 삭제할까요?`)) return;
    setDeletingIp(ip);
    try {
      const res = await fetch(`/api/access-log/entries?ip=${encodeURIComponent(ip)}`, { method: "DELETE" });
      if (res.ok) {
        setSummaries((prev) => prev.filter((s) => s.ip !== ip));
        if (expandedIp === ip) setExpandedIp(null);
      }
    } catch {
      // Transient network error: leave the row as-is, user can retry.
    } finally {
      setDeletingIp(null);
    }
  }

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const url =
        minHitCount > 0 ? `/api/access-log/summary?minHitCount=${minHitCount}` : "/api/access-log/summary";
      const res = await fetch(url);
      if (res.ok) setSummaries(await res.json());
    } catch {
      // Transient network error: keep showing the last known state.
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {summaries.length === 0 ? "아직 기록된 접속이 없습니다" : `고유 IP ${summaries.length}개`}
          {note && <span className="ml-2 text-zinc-400 dark:text-zinc-500">· {note}</span>}
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          title="지금 새로고침"
          aria-label="지금 새로고침"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          각 서버의 ip-log-agent가 접속을 보고하면 여기에 표시됩니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
                <th className="w-6 px-3 py-2" />
                <th className="px-3 py-2 font-medium">IP</th>
                <th className="px-3 py-2 font-medium">위치</th>
                <th className="px-3 py-2 font-medium">서버</th>
                <th className="px-3 py-2 font-medium text-right">횟수</th>
                <th className="px-3 py-2 font-medium">최초 접속</th>
                <th className="px-3 py-2 font-medium">최근 접속</th>
                <th className="w-8 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <IpSummaryRow
                  key={s.ip}
                  summary={s}
                  expanded={expandedIp === s.ip}
                  deleting={deletingIp === s.ip}
                  onToggle={() => setExpandedIp(expandedIp === s.ip ? null : s.ip)}
                  onDelete={() => handleDelete(s.ip)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AccessLogView;

function locationLabel(country: string | null, city: string | null): string {
  if (!country && !city) return "—";
  return [city, country].filter(Boolean).join(", ");
}

function IpSummaryRow({
  summary,
  expanded,
  deleting,
  onToggle,
  onDelete,
}: {
  summary: IpSummaryDTO;
  expanded: boolean;
  deleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900"
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-zinc-400">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="px-3 py-2 font-mono tabular-nums">{summary.ip}</td>
        <td className="px-3 py-2 text-zinc-500">{locationLabel(summary.country, summary.city)}</td>
        <td className="px-3 py-2 text-zinc-500">{summary.sources.join(", ")}</td>
        <td className="px-3 py-2 text-right tabular-nums">{summary.hitCount}</td>
        <td className="px-3 py-2 text-zinc-500">{new Date(summary.firstSeen).toLocaleString()}</td>
        <td className="px-3 py-2 text-zinc-500">{new Date(summary.lastSeen).toLocaleString()}</td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={deleting}
            title={`${summary.ip} 기록 삭제`}
            aria-label={`${summary.ip} 기록 삭제`}
            className="rounded-md p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950"
          >
            <Trash2 size={13} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
            <IpEntryHistory ip={summary.ip} />
          </td>
        </tr>
      )}
    </>
  );
}

function IpEntryHistory({ ip }: { ip: string }) {
  const [entries, setEntries] = useState<AccessLogEntryDTO[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/access-log/entries?ip=${encodeURIComponent(ip)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: AccessLogEntryDTO[]) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ip]);

  if (error) return <span className="text-xs text-red-500">불러오지 못했습니다</span>;
  if (entries === null) return <span className="text-xs text-zinc-400">불러오는 중...</span>;
  if (entries.length === 0) return <span className="text-xs text-zinc-400">기록 없음</span>;

  return (
    <div className="flex flex-col gap-1 text-xs whitespace-normal">
      {entries.map((e) => (
        <div key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-zinc-600 dark:text-zinc-400">
          <span className="tabular-nums text-zinc-400">{new Date(e.at).toLocaleString()}</span>
          <span className="font-medium">{e.source}</span>
          <span className="font-mono">{e.method}</span>
          <span className="font-mono">{e.path}</span>
          {e.userAgent && <span className="text-zinc-400">{e.userAgent}</span>}
        </div>
      ))}
    </div>
  );
}
