"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { USAGE_METRICS } from "../metrics";
import { usedToRemainingPercent } from "../logic";
import type { CardStatesResponse, UsageCardState } from "../types";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Re-fetches card state on mount, on a timer, when the tab regains
 * visibility, AND on `pageshow` — the last one specifically covers browser
 * back/forward navigation (including bfcache restores), which can bring
 * this component back without a fresh mount/effect run if the router
 * reuses a cached instance. Together these cover "menu navigation back to
 * home" and "browser back button to home" without needing an actual
 * usage-collector or push mechanism.
 */
interface CardsViewProps {
  initialStates: CardStatesResponse;
}

export function CardsView({ initialStates }: CardsViewProps) {
  const [states, setStates] = useState(initialStates);
  const [collecting, setCollecting] = useState(false);
  const [notConnected, setNotConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/ai-usage/cards");
        if (!res.ok || cancelled) return;
        const data: CardStatesResponse = await res.json();
        if (!cancelled) setStates(data);
      } catch {
        // Transient network error: keep showing the last known state rather
        // than clearing it.
      }
    }

    refresh();
    // This only re-reads what's already stored — the server independently
    // collects fresh values from OpenAI on its own schedule (see
    // instrumentation-node.ts's background collector) regardless of whether
    // any tab is open. This timer just keeps an open tab in sync with that.
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    function onVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  async function handleCollectNow() {
    if (collecting) return;
    setCollecting(true);
    setNotConnected(false);
    try {
      const res = await fetch("/api/ai-usage/connections/collect", { method: "POST" });
      if (res.status === 400) {
        setNotConnected(true);
        return;
      }
      // Whether the fetch to OpenAI itself succeeded or not, the cards
      // endpoint reflects the current true state — re-read it either way.
      const cardsRes = await fetch("/api/ai-usage/cards");
      if (cardsRes.ok) setStates(await cardsRes.json());
    } catch {
      // Transient network error: leave the last known state as-is.
    } finally {
      setCollecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        {notConnected && (
          <Link href="/ai-usage/connections" className="text-xs text-amber-600 hover:underline dark:text-amber-400">
            OpenAI 계정이 연결되어 있지 않습니다 — 연결하기
          </Link>
        )}
        <button
          type="button"
          onClick={handleCollectNow}
          disabled={collecting}
          title="지금 새로고침"
          aria-label="지금 새로고침"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <RefreshCw size={16} className={collecting ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {USAGE_METRICS.map((metric) => (
          <UsageCard key={metric.id} label={metric.displayName} state={states[metric.id]} />
        ))}
      </div>
    </div>
  );
}

export default CardsView;

function UsageCard({ label, state }: { label: string; state: UsageCardState | undefined }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</div>
      {renderBody(state)}
    </div>
  );
}

function renderBody(state: UsageCardState | undefined) {
  if (!state || state.kind === "UNSUPPORTED") {
    return <div className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">수치 확인 미지원</div>;
  }
  if (state.kind === "NO_DATA") {
    return <div className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">아직 입력한 기록 없음</div>;
  }

  const observedAt = new Date(state.entry.recordedAt).toLocaleString();
  const badge =
    state.kind === "PERIOD_ENDED" ? (
      <span className="text-xs text-amber-600 dark:text-amber-400">기간 종료됨</span>
    ) : state.kind === "STALE" ? (
      <span className="text-xs text-amber-600 dark:text-amber-400">오래된 기록</span>
    ) : null;

  return (
    <div className="mt-2">
      <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {usedToRemainingPercent(state.entry.usagePercent)}% 남음
      </div>
      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        마지막 확인: {observedAt} {badge}
      </div>
    </div>
  );
}
