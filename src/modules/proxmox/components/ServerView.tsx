"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ProxmoxOverview } from "../types";
import {
  formatBytes,
  formatPercent,
  formatUptime,
  usageLevelClass,
  usageSeverity,
  tempLevelClass,
  type UsageSeverity,
} from "../format";
import { Card } from "@/components/ui/Card";
import { Panel } from "@/components/ui/Panel";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";

// Same severity → color convention as the AI-usage dashboard's cards (green/
// amber/red), reused here so the two modules read as one app.
const SEVERITY_STYLES: Record<UsageSeverity, { text: string; bar: string }> = {
  ok: { text: "text-green-600 dark:text-green-400", bar: "bg-green-500" },
  warning: { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
  critical: { text: "text-red-600 dark:text-red-400", bar: "bg-red-500" },
};

function MetricBar({ label, fraction, valueText }: { label: string; fraction: number; valueText: string }) {
  const styles = SEVERITY_STYLES[usageSeverity(fraction)];
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">{label}</span>
        <span className={`tabular-nums ${styles.text}`}>{valueText}</span>
      </div>
      <ProgressBar value={fraction * 100} indicatorClassName={styles.bar} className="mt-1" />
    </div>
  );
}

const REFRESH_INTERVAL_MS = 60 * 1000;

interface ServerViewProps {
  configured: boolean;
  initialOverview: ProxmoxOverview | null;
  initialError: string | null;
  /** Panel heading (home dashboard only). */
  title?: string;
}

function guestKey(g: { type: string; vmid: number }): string {
  return `${g.type}-${g.vmid}`;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function ServerView({ configured, initialOverview, initialError, title }: ServerViewProps) {
  const [overview, setOverview] = useState(initialOverview);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const res = await fetch("/api/proxmox/status", { cache: "no-store" });
      if (!res.ok) {
        setError(await readErrorMessage(res, `조회 실패 (${res.status})`));
        return;
      }
      const data: ProxmoxOverview = await res.json();
      setOverview(data);
      setError(null);
    } catch {
      // Transient network error: keep showing the last known state.
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    function onVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [configured, refresh]);

  if (!configured) {
    return (
      <Panel title={title}>
        <Card variant="inset" className="text-sm text-text-muted">
          Proxmox 연결이 설정되어 있지 않습니다 — `.env`의 PROXMOX_URL / PROXMOX_TOKEN_ID /
          PROXMOX_TOKEN_SECRET / PROXMOX_SSL_FINGERPRINT를 채워주세요.
        </Card>
      </Panel>
    );
  }

  return (
    <Panel
      title={title}
      actions={
        <IconButton type="button" onClick={refresh} disabled={loading} title="지금 새로고침" aria-label="지금 새로고침">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </IconButton>
      }
    >
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {overview && (
        <>
          {/* Columns follow the panel's width (container query), not the
              viewport. */}
          <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {overview.nodes.map((n) => (
              <Card key={n.node} variant="inset">
                <div className="text-sm font-medium text-text-muted">호스트: {n.node}</div>
                <div className="mt-3 flex flex-col gap-3">
                  <MetricBar
                    label="CPU"
                    fraction={n.cpuFraction}
                    valueText={`${formatPercent(n.cpuFraction)} (${n.cpuCount}코어)`}
                  />
                  <MetricBar
                    label="메모리"
                    fraction={n.memTotal > 0 ? n.memUsed / n.memTotal : 0}
                    valueText={`${formatBytes(n.memUsed)} / ${formatBytes(n.memTotal)}`}
                  />
                  <MetricBar
                    label="루트 디스크"
                    fraction={n.diskTotal > 0 ? n.diskUsed / n.diskTotal : 0}
                    valueText={`${formatBytes(n.diskUsed)} / ${formatBytes(n.diskTotal)}`}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-border pt-3 text-sm">
                  {overview.sensors?.cpuTempC != null && (
                    <>
                      <dt className="text-text-muted">CPU 온도</dt>
                      <dd className={`text-right tabular-nums ${tempLevelClass(overview.sensors.cpuTempC)}`}>
                        {overview.sensors.cpuTempC.toFixed(1)}°C
                      </dd>
                    </>
                  )}
                  {overview.sensors?.gpuTempC != null && (
                    <>
                      <dt className="text-text-muted" title="별도 그래픽카드가 아니라 CPU에 내장된 디스플레이 출력용 그래픽 엔진입니다.">
                        내장 GPU 온도
                      </dt>
                      <dd className={`text-right tabular-nums ${tempLevelClass(overview.sensors.gpuTempC)}`}>
                        {overview.sensors.gpuTempC.toFixed(1)}°C
                      </dd>
                    </>
                  )}
                  {overview.sensors?.nvmeTempC != null && (
                    <>
                      <dt className="text-text-muted">NVMe 온도</dt>
                      <dd className={`text-right tabular-nums ${tempLevelClass(overview.sensors.nvmeTempC)}`}>
                        {overview.sensors.nvmeTempC.toFixed(1)}°C
                      </dd>
                    </>
                  )}
                  <dt className="text-text-muted">가동 시간</dt>
                  <dd className="text-right">{formatUptime(n.uptimeSeconds)}</dd>
                </dl>
              </Card>
            ))}

            {overview.storages.map((s) => (
              <Card key={s.storage} variant="inset">
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm font-medium text-text-muted"
                    title="VM/컨테이너 디스크가 실제로 저장되는 곳(호스트 루트 디스크와 별개)"
                  >
                    {s.storage}
                  </span>
                  <Badge variant={s.active ? "success" : "neutral"}>{s.active ? "active" : "inactive"}</Badge>
                </div>
                <div className="mt-1 text-xs text-text-muted">{s.type}</div>
                <div className="mt-3">
                  <MetricBar
                    label="사용량"
                    fraction={s.total > 0 ? s.used / s.total : 0}
                    valueText={`${formatBytes(s.used)} / ${formatBytes(s.total)}`}
                  />
                </div>
              </Card>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/70">
            <div className="overflow-x-auto">
            {/* whitespace-nowrap (inherited by every th/td) keeps columns from
                wrapping character-by-character on narrow screens — the
                wrapping div above scrolls horizontally instead. */}
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-inset text-xs text-text-muted dark:bg-transparent">
                  <th className="px-3 py-2 font-medium">이름</th>
                  <th className="px-3 py-2 font-medium">종류</th>
                  <th className="px-3 py-2 font-medium">상태</th>
                  <th className="px-3 py-2 font-medium">CPU</th>
                  <th className="px-3 py-2 font-medium">메모리</th>
                  <th className="px-3 py-2 font-medium">디스크</th>
                  <th className="px-3 py-2 font-medium">가동 시간</th>
                </tr>
              </thead>
              <tbody>
                {overview.guests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-text-muted">
                      VM/컨테이너가 없습니다
                    </td>
                  </tr>
                ) : (
                  overview.guests.map((g) => (
                      <tr key={guestKey(g)} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2">{g.name}</td>
                        <td className="px-3 py-2 uppercase text-text-muted">{g.type}</td>
                        <td className="px-3 py-2">
                          <Badge variant={g.status === "running" ? "success" : "neutral"}>{g.status}</Badge>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {g.status === "running" ? formatPercent(g.cpuFraction) : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {g.status === "running" ? `${formatBytes(g.memUsed)} / ${formatBytes(g.memTotal)}` : "—"}
                        </td>
                        <td
                          className={`px-3 py-2 tabular-nums ${usageLevelClass(g.diskTotal > 0 ? g.diskUsed / g.diskTotal : 0)}`}
                        >
                          {g.diskTotal > 0 ? (
                            <>
                              {formatBytes(g.diskUsed)} / {formatBytes(g.diskTotal)}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">{g.status === "running" ? formatUptime(g.uptimeSeconds) : "—"}</td>
                      </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
