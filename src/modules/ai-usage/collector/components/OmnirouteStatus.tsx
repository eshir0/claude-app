"use client";

import { useState } from "react";
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
  claude_pro_5h_window: "Claude 5시간 한도",
  claude_pro_weekly: "Claude 주간 한도",
};

interface CollectResult {
  ok: boolean;
  status: number;
  body: unknown;
  savedEntries: AiUsageEntryDTO[];
}

/**
 * Unlike ConnectPanel (Codex), there is no login flow here — this app never
 * holds an Anthropic credential of its own. It only calls a self-hosted
 * OmniRoute instance's management API, which already owns the OAuth
 * connection to the user's own Claude account. Configuration is three env
 * vars (see .env.example); "연결됨/연결 안 됨" below just reflects whether
 * those are set, not a session this app manages.
 */
export default function OmnirouteStatus() {
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collectResult, setCollectResult] = useState<CollectResult | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  async function handleCollectNow() {
    if (collecting) return;
    setCollecting(true);
    setCollectError(null);
    setNotConfigured(false);
    try {
      const res = await fetch("/api/ai-usage/omniroute/collect", { method: "POST" });
      if (res.status === 400) {
        setNotConfigured(true);
        return;
      }
      if (!res.ok) {
        setCollectError(await readErrorMessage(res, `수집 실패 (${res.status})`));
        return;
      }
      setCollectResult(await res.json());
    } finally {
      setCollecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        이 앱은 Anthropic 계정 크리덴셜을 직접 다루지 않습니다 — 이미 본인 소유의 OmniRoute 인스턴스에
        연결된 Claude 계정에서, OmniRoute 자체 관리 API를 통해 이미 계산된 사용량 수치만 읽어옵니다.
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="font-medium text-zinc-900 dark:text-zinc-50">Claude (OmniRoute 경유)</div>

        <button
          type="button"
          onClick={handleCollectNow}
          disabled={collecting}
          className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {collecting ? "수집 중..." : "지금 수집"}
        </button>

        {notConfigured && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            OmniRoute 연동이 설정되지 않았습니다 — .env.example의 OMNIROUTE_* 항목을 확인해주세요.
          </p>
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
      </div>
    </div>
  );
}
