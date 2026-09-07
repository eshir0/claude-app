"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ProxmoxOverview } from "../types";
import { formatBytes, formatPercent, formatUptime, usageLevelClass, tempLevelClass } from "../format";

const REFRESH_INTERVAL_MS = 60 * 1000;

interface ServerViewProps {
  configured: boolean;
  initialOverview: ProxmoxOverview | null;
  initialError: string | null;
}

interface GuestRate {
  inBytesPerSec: number;
  outBytesPerSec: number;
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
  const [rates, setRates] = useState<Map<string, GuestRate>>(new Map());
  // Proxmox's netin/netout are cumulative byte counters, not a speed — a
  // rate only exists once there are two samples to diff. Kept in a ref
  // (not state) since updating it must never itself trigger a re-render.
  // Date.now() is impure, so it's seeded in an effect (post-render), not
  // during render itself.
  const prevSnapshotRef = useRef<{ guests: ProxmoxOverview["guests"]; at: number } | null>(null);
  useEffect(() => {
    if (initialOverview && !prevSnapshotRef.current) {
      prevSnapshotRef.current = { guests: initialOverview.guests, at: Date.now() };
    }
    // Only meant to seed the very first snapshot once, from the server-provided initial data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recordSnapshotAndComputeRates(next: ProxmoxOverview) {
    const now = Date.now();
    const prev = prevSnapshotRef.current;
    if (prev) {
      const deltaSeconds = (now - prev.at) / 1000;
      if (deltaSeconds > 0) {
        const prevByKey = new Map(prev.guests.map((g) => [guestKey(g), g]));
        const nextRates = new Map<string, GuestRate>();
        for (const g of next.guests) {
          const p = prevByKey.get(guestKey(g));
          if (!p || g.status !== "running") continue;
          const inDelta = g.netInBytes - p.netInBytes;
          const outDelta = g.netOutBytes - p.netOutBytes;
          // A negative delta means the counter reset (guest restarted) —
          // show 0 rather than a nonsense negative speed.
          nextRates.set(guestKey(g), {
            inBytesPerSec: Math.max(0, inDelta) / deltaSeconds,
            outBytesPerSec: Math.max(0, outDelta) / deltaSeconds,
          });
        }
        setRates(nextRates);
      }
    }
    prevSnapshotRef.current = { guests: next.guests, at: now };
  }

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
      recordSnapshotAndComputeRates(data);
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
                <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                  <dt className="text-zinc-500">CPU</dt>
                  <dd className="text-right tabular-nums">
                    {formatPercent(n.cpuFraction)} ({n.cpuCount}코어)
                  </dd>
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
                      <dt className="text-zinc-500">GPU 온도</dt>
                      <dd className={`text-right tabular-nums ${tempLevelClass(overview.sensors.gpuTempC)}`}>
                        {overview.sensors.gpuTempC.toFixed(1)}°C
                      </dd>
                    </>
                  )}
                  <dt className="text-zinc-500">메모리</dt>
                  <dd className="text-right tabular-nums">
                    {formatBytes(n.memUsed)} / {formatBytes(n.memTotal)}
                  </dd>
                  <dt className="text-zinc-500">루트 디스크</dt>
                  <dd className={`text-right tabular-nums ${usageLevelClass(n.diskTotal > 0 ? n.diskUsed / n.diskTotal : 0)}`}>
                    {formatBytes(n.diskUsed)} / {formatBytes(n.diskTotal)}
                  </dd>
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
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              데이터센터 스토리지 — VM/컨테이너 디스크가 실제로 저장되는 곳(호스트 루트 디스크와 별개)
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {overview.storages.map((s) => (
                <div key={s.storage} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{s.storage}</span>
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
                  <div className={`mt-2 text-sm tabular-nums ${usageLevelClass(s.total > 0 ? s.used / s.total : 0)}`}>
                    {formatBytes(s.used)} / {formatBytes(s.total)}
                    <span className="ml-1 text-zinc-500">({formatPercent(s.total > 0 ? s.used / s.total : 0)})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="px-3 py-2 font-medium">이름</th>
                  <th className="px-3 py-2 font-medium">종류</th>
                  <th className="px-3 py-2 font-medium">상태</th>
                  <th className="px-3 py-2 font-medium">CPU</th>
                  <th className="px-3 py-2 font-medium">메모리</th>
                  <th className="px-3 py-2 font-medium">디스크</th>
                  <th className="px-3 py-2 font-medium">네트워크</th>
                  <th className="px-3 py-2 font-medium">가동 시간</th>
                </tr>
              </thead>
              <tbody>
                {overview.guests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-zinc-500">
                      VM/컨테이너가 없습니다
                    </td>
                  </tr>
                ) : (
                  overview.guests.map((g) => {
                    const rate = rates.get(guestKey(g));
                    return (
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
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {g.status !== "running" ? "—" : rate ? (
                            <>
                              ↓{formatBytes(rate.inBytesPerSec)}/s ↑{formatBytes(rate.outBytesPerSec)}/s
                            </>
                          ) : (
                            <span className="text-zinc-400">측정 중...</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{g.status === "running" ? formatUptime(g.uptimeSeconds) : "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
