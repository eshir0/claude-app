"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight, Trash2, ShieldAlert } from "lucide-react";
import type { IpSummaryDTO, AccessLogEntryDTO } from "../types";
import { isSuspiciousPath } from "../suspicious-path";
import { Card } from "@/components/ui/Card";
import { Panel } from "@/components/ui/Panel";
import { IconButton } from "@/components/ui/IconButton";
import { formatDateTime } from "@/lib/datetime";

interface AccessLogViewProps {
  initialSummaries: IpSummaryDTO[];
  /** Only IPs with at least this many hits are fetched/shown — used by the
   * home-page widget so low-traffic IPs stay out of the home screen and
   * only appear on the full /access-log page. 0 (default) shows everything. */
  minHitCount?: number;
  /** Optional caption shown next to the unique-IP count, e.g. explaining
   * why some IPs are missing here (see AccessLogHomeWidget). */
  note?: string;
  /** Panel heading (home dashboard only). */
  title?: string;
}

export function AccessLogView({ initialSummaries, minHitCount = 0, note, title }: AccessLogViewProps) {
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
    <Panel
      title={title}
      description={
        <>
          {summaries.length === 0 ? "아직 기록된 접속이 없습니다" : `고유 IP ${summaries.length}개`}
          {note && <span className="ml-2 opacity-70">· {note}</span>}
        </>
      }
      actions={
        <IconButton type="button" onClick={handleRefresh} disabled={refreshing} title="지금 새로고침" aria-label="지금 새로고침">
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </IconButton>
      }
    >
      {summaries.length === 0 ? (
        <Card variant="inset" className="text-sm text-text-muted">
          각 서버의 ip-log-agent가 접속을 보고하면 여기에 표시됩니다.
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
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
        </div>
      )}
    </Panel>
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
      <tr className="cursor-pointer border-b border-border last:border-b-0 hover:bg-bg" onClick={onToggle}>
        <td className="px-3 py-2 text-text-muted">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="px-3 py-2 font-mono tabular-nums">
          <span
            className={
              summary.isSuspicious
                ? "inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400"
                : ""
            }
            title={summary.isSuspicious ? "알려진 공격/스캔 경로 접근이 감지된 IP입니다" : undefined}
          >
            {summary.isSuspicious && <ShieldAlert size={13} />}
            {summary.ip}
          </span>
        </td>
        <td className="px-3 py-2 text-text-muted">{locationLabel(summary.country, summary.city)}</td>
        <td className="px-3 py-2 text-text-muted">{summary.sources.join(", ")}</td>
        <td className="px-3 py-2 text-right tabular-nums">{summary.hitCount}</td>
        <td className="px-3 py-2 text-text-muted">{formatDateTime(summary.firstSeen)}</td>
        <td className="px-3 py-2 text-text-muted">{formatDateTime(summary.lastSeen)}</td>
        <td className="px-3 py-2 text-right">
          <IconButton
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={deleting}
            title={`${summary.ip} 기록 삭제`}
            aria-label={`${summary.ip} 기록 삭제`}
            className="p-1 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
          >
            <Trash2 size={13} />
          </IconButton>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-bg px-3 py-2">
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
  if (entries === null) return <span className="text-xs text-text-muted">불러오는 중...</span>;
  if (entries.length === 0) return <span className="text-xs text-text-muted">기록 없음</span>;

  return (
    <div className="flex flex-col gap-1 text-xs whitespace-normal">
      {entries.map((e) => (
        <div key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-text-muted">
          <span className="tabular-nums opacity-70">{formatDateTime(e.at)}</span>
          <span className="font-medium text-text">{e.source}</span>
          <span className="font-mono">{e.method}</span>
          <span
            className={
              isSuspiciousPath(e.path) ? "font-mono font-semibold text-red-600 dark:text-red-400" : "font-mono"
            }
          >
            {e.path}
          </span>
          {e.userAgent && <span className="opacity-70">{e.userAgent}</span>}
        </div>
      ))}
    </div>
  );
}
