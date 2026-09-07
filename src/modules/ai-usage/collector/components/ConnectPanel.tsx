"use client";

import { useEffect, useRef, useState } from "react";
import type { ConnectionStatusDTO } from "@/modules/ai-usage/collector/connectionService";
import { usedToRemainingPercent } from "@/modules/ai-usage/logic";
import type { AiUsageEntryDTO } from "@/modules/ai-usage/types";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

const METRIC_LABELS: Record<string, string> = {
  chatgpt_codex_5h_window: "Codex 5시간 한도",
  chatgpt_codex_weekly: "Codex 주간 한도",
};

interface CollectResult {
  ok: boolean;
  status: number;
  body: unknown;
  savedEntries: AiUsageEntryDTO[];
}

type DeviceLoginState =
  | { phase: "idle" }
  | { phase: "pending"; verificationUri: string; userCode: string }
  | { phase: "failed"; error: string };

const POLL_INTERVAL_MS = 3000;

export default function ConnectPanel() {
  const [status, setStatus] = useState<ConnectionStatusDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [login, setLogin] = useState<DeviceLoginState>({ phase: "idle" });
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collectResult, setCollectResult] = useState<CollectResult | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refreshStatus() {
    const res = await fetch("/api/ai-usage/connections", { cache: "no-store" });
    if (res.ok) setStatus(await res.json());
  }

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true);
      refreshStatus().finally(() => setLoading(false));
    });
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer.current = setInterval(async () => {
      const res = await fetch("/api/ai-usage/connections/poll", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      if (body.status === "connected") {
        stopPolling();
        setLogin({ phase: "idle" });
        await refreshStatus();
      } else if (body.status === "failed") {
        stopPolling();
        setLogin({ phase: "failed", error: body.error ?? "로그인 실패" });
      } else if (body.status === "pending") {
        setLogin({ phase: "pending", verificationUri: body.verificationUri, userCode: body.userCode });
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleConnect() {
    if (starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/ai-usage/connections", { method: "POST" });
      if (!res.ok) {
        setLogin({ phase: "failed", error: await readErrorMessage(res, `연결 시작 실패 (${res.status})`) });
        return;
      }
      const body = await res.json();
      setLogin({ phase: "pending", verificationUri: body.verificationUri, userCode: body.userCode });
      startPolling();
    } finally {
      setStarting(false);
    }
  }

  async function handleDisconnect() {
    stopPolling();
    setLogin({ phase: "idle" });
    setCollectResult(null);
    const res = await fetch("/api/ai-usage/connections", { method: "DELETE" });
    if (res.ok || res.status === 204) await refreshStatus();
  }

  async function handleCollectNow() {
    if (collecting) return;
    setCollecting(true);
    setCollectError(null);
    try {
      const res = await fetch("/api/ai-usage/connections/collect", { method: "POST" });
      if (!res.ok) {
        setCollectError(await readErrorMessage(res, `수집 실패 (${res.status})`));
        return;
      }
      setCollectResult(await res.json());
      await refreshStatus();
    } finally {
      setCollecting(false);
    }
  }

  const connected = status?.connected ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Codex CLI의 공식 기기 코드(device code) 로그인으로 본인 ChatGPT 계정에 연결합니다 — 비밀번호나
        쿠키를 직접 붙여넣지 않으며, 로그인은 항상 사용자님 자신의 브라우저에서 완료됩니다.
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="font-medium text-zinc-900 dark:text-zinc-50">ChatGPT / Codex</div>
          {connected && (
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                status?.status === "ERROR"
                  ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                  : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
              }`}
            >
              {status?.status === "ERROR" ? "오류" : "연결됨"}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">불러오는 중...</p>
        ) : (
          <>
            {connected && status?.lastCheckedAt && (
              <div className="text-xs text-zinc-500">
                마지막 확인: {new Date(status.lastCheckedAt).toLocaleString()}
                {status.lastError && <span className="ml-2 text-red-600 dark:text-red-400">{status.lastError}</span>}
              </div>
            )}

            {login.phase === "pending" && (
              <div className="flex flex-col gap-1 rounded border border-blue-300 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950">
                <p>
                  아래 링크를 <strong>본인 폰 또는 PC 브라우저</strong>에서 열고 로그인한 뒤, 코드를
                  입력하세요.
                </p>
                <a
                  href={login.verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-blue-700 underline dark:text-blue-300"
                >
                  {login.verificationUri}
                </a>
                <p className="font-mono text-lg font-semibold">{login.userCode}</p>
                <p className="text-xs text-zinc-500">완료할 때까지 자동으로 확인 중...</p>
              </div>
            )}

            {login.phase === "failed" && (
              <p className="text-sm text-red-600 dark:text-red-400">로그인 실패: {login.error}</p>
            )}

            {!connected ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={starting || login.phase === "pending"}
                className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {starting ? "시작 중..." : "연결하기"}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCollectNow}
                  disabled={collecting}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {collecting ? "수집 중..." : "지금 수집"}
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  연결 해제
                </button>
              </div>
            )}

            {collectError && <p className="text-sm text-red-600 dark:text-red-400">{collectError}</p>}

            {collectResult !== null && (
              <div className="flex flex-col gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-800">
                {collectResult.savedEntries.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {collectResult.savedEntries.map((e) => (
                      <li key={e.id}>
                        <span className="font-medium">{METRIC_LABELS[e.metricId] ?? e.metricId}</span>:{" "}
                        {usedToRemainingPercent(e.usagePercent)}% 남음
                        {e.resetsAt && (
                          <span className="text-zinc-500"> · 리셋 {new Date(e.resetsAt).toLocaleString()}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    응답에서 알려진 사용량 창(5시간/주간)을 찾지 못해 저장하지 않았습니다 — 아래 원본 응답을
                    확인해주세요.
                  </p>
                )}
                <details>
                  <summary className="cursor-pointer text-xs text-zinc-500">원본 API 응답 보기</summary>
                  <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-900">
                    {JSON.stringify(collectResult, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
