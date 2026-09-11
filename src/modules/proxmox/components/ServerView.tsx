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
        <span className="text-zinc-500">{label}</span>
        <span className={`tabular-nums ${styles.text}`}>{valueText}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-1.5 rounded-full ${styles.bar}`}
          style={{ width: `${Math.max(0, Math.min(100, fraction * 100))}%` }}
        />
      </div>
    </div>
  );
}

const REFRESH_INTERVAL_MS = 60 * 1000;

interface ServerViewProps {
  configured: boolean;
  initialOverview: ProxmoxOverview | null;
  initialError: string | null;
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

export default function ServerView({ configured, initialOverview, initialError }: ServerViewProps) {
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
      <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Proxmox 연결이 설정되어 있지 않습니다 — `.env`의 PROXMOX_URL / PROXMOX_TOKEN_ID /
        PROXMOX_TOKEN_SECRET / PROXMOX_SSL_FINGERPRINT를 채워주세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          title="지금 새로고침"
          aria-label="지금 새로고침"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {overview && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overview.nodes.map((n) => (
              <div key={n.node} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">호스트: {n.node}</div>
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
                <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-900">
                  {overview.sensors?.cpuTempC != null && (
                    <>
                      <dt className="text-zinc-500">CPU 온도</dt>
                      <dd className={`text-right tabular-nums ${tempLevelClass(overview.sensors.cpuTempC)}`}>
                        {overview.sensors.cpuTempC.toFixed(1)}°C
                      </dd>
                    </>
                  )}
                  {overview.sensors?.gpuTempC != null && (
                    <>
                      <dt className="text-zinc-500" title="별도 그래픽카드가 아니라 CPU에 내장된 디스플레이 출력용 그래픽 엔진입니다.">
                        내장 GPU 온도
                      </dt>
                      <dd className={`text-right tabular-nums ${tempLevelClass(overview.sensors.gpuTempC)}`}>
                        {overview.sensors.gpuTempC.toFixed(1)}°C
                      </dd>
                    </>
                  )}
                  {overview.sensors?.nvmeTempC != null && (
                    <>
                      <dt className="text-zinc-500">NVMe 온도</dt>
                      <dd className={`text-right tabular-nums ${tempLevelClass(overview.sensors.nvmeTempC)}`}>
                        {overview.sensors.nvmeTempC.toFixed(1)}°C
                      </dd>
                    </>
                  )}
                  <dt className="text-zinc-500">가동 시간</dt>
                  <dd className="text-right">{formatUptime(n.uptimeSeconds)}</dd>
                </dl>
              </div>
            ))}

            {overview.storages.map((s) => (
              <div key={s.storage} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm font-medium text-zinc-600 dark:text-zinc-400"
                    title="VM/컨테이너 디스크가 실제로 저장되는 곳(호스트 루트 디스크와 별개)"
                  >
                    {s.storage}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      s.active
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {s.active ? "active" : "inactive"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">{s.type}</div>
                <div className="mt-3">
                  <MetricBar
                    label="사용량"
                    fraction={s.total > 0 ? s.used / s.total : 0}
                    valueText={`${formatBytes(s.used)} / ${formatBytes(s.total)}`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            {/* whitespace-nowrap (inherited by every th/td) keeps columns from
                wrapping character-by-character on narrow screens — the
                wrapping div above scrolls horizontally instead. */}
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
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
                    <td colSpan={7} className="px-3 py-4 text-center text-zinc-500">
                      VM/컨테이너가 없습니다
                    </td>
                  </tr>
                ) : (
                  overview.guests.map((g) => (
                      <tr key={guestKey(g)} className="border-b border-zinc-100 dark:border-zinc-900">
                        <td className="px-3 py-2">{g.name}</td>
                        <td className="px-3 py-2 uppercase text-zinc-500">{g.type}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs ${
                              g.status === "running"
                                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            {g.status}
                          </span>
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
        </>
      )}
    </div>
  );
}
