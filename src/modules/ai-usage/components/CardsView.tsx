"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { USAGE_METRICS } from "../metrics";
import { usedToRemainingPercent, formatResetCountdown, usageSeverity, type UsageSeverity } from "../logic";
import type { CardStatesResponse, UsageCardState } from "../types";

// Colors read as "severity", not "brand accent" — kept apart from the rest
// of the app's zinc-only palette on purpose, same idea as the reference
// quota dashboard this was modeled after.
const SEVERITY_STYLES: Record<UsageSeverity, { border: string; dot: string; text: string; bar: string }> = {
  ok: {
    border: "border-l-green-500",
    dot: "bg-green-500",
    text: "text-green-600 dark:text-green-400",
    bar: "bg-green-500",
  },
  warning: {
    border: "border-l-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  critical: {
    border: "border-l-red-500",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    bar: "bg-red-500",
  },
};
const NEUTRAL_STYLE = {
  border: "border-l-zinc-300 dark:border-l-zinc-700",
  dot: "bg-zinc-400",
  text: "text-zinc-900 dark:text-zinc-50",
  bar: "bg-zinc-400",
};

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

    // Mount — which also covers a full page reload — does a live collect
    // from both providers first, not just a re-read of what's already
    // stored, so the numbers are fresh right when the page opens rather
    // than waiting for the next background-collector tick (up to 30 min).
    async function collectThenRefresh() {
      try {
        await Promise.all([
          fetch("/api/ai-usage/connections/collect", { method: "POST" }).catch(() => null),
          fetch("/api/ai-usage/omniroute/collect", { method: "POST" }).catch(() => null),
        ]);
      } finally {
        if (!cancelled) await refresh();
      }
    }
    collectThenRefresh();

    // Subsequent ticks only re-read what's already stored — the server
    // independently collects fresh values on its own schedule (see
    // instrumentation-node.ts's background collector) regardless of whether
    // any tab is open, so this timer just keeps an open tab in sync with
    // that without hammering both providers on every focus/visibility event.
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
      // Both providers are collected regardless of whether either fails —
      // OmniRoute (Claude) being unconfigured shouldn't block Codex from
      // refreshing, and vice versa.
      const [codexRes] = await Promise.all([
        fetch("/api/ai-usage/connections/collect", { method: "POST" }).catch(() => null),
        fetch("/api/ai-usage/omniroute/collect", { method: "POST" }).catch(() => null),
      ]);
      if (codexRes?.status === 400) setNotConnected(true);
      // Whether either upstream fetch itself succeeded or not, the cards
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
      {/* One row across at desktop widths (flex, not grid — width divides
          evenly no matter how many metrics are registered); stacks/wraps on
          narrower screens where a single row wouldn't fit. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-nowrap">
        {USAGE_METRICS.map((metric) => (
          <UsageCard key={metric.id} label={metric.displayName} state={states[metric.id]} />
        ))}
      </div>
    </div>
  );
}

export default CardsView;

function UsageCard({ label, state }: { label: string; state: UsageCardState | undefined }) {
  const remaining =
    state && (state.kind === "OK" || state.kind === "STALE" || state.kind === "PERIOD_ENDED")
      ? usedToRemainingPercent(state.entry.usagePercent)
      : null;
  const severityStyle = remaining !== null ? SEVERITY_STYLES[usageSeverity(remaining)] : NEUTRAL_STYLE;

  return (
    <div
      className={`rounded-lg border border-l-4 border-zinc-200 p-4 dark:border-zinc-800 lg:min-w-0 lg:flex-1 ${severityStyle.border}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${severityStyle.dot}`} />
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      </div>
      {renderBody(state, remaining, severityStyle)}
    </div>
  );
}

function renderBody(
  state: UsageCardState | undefined,
  remaining: number | null,
  colored: { text: string; bar: string },
) {
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
      <div className={`text-2xl font-semibold ${colored.text}`}>{remaining}% left</div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-1.5 rounded-full ${colored.bar}`}
          style={{ width: `${Math.max(0, Math.min(100, remaining ?? 0))}%` }}
        />
      </div>
      <div className="mt-2 flex flex-col gap-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {state.entry.resetsAt && (
          <span>
            {new Date(state.entry.resetsAt).toLocaleString()} ({formatResetCountdown(state.entry.resetsAt)})
          </span>
        )}
        <span>
          마지막 확인: {observedAt} {badge}
        </span>
      </div>
    </div>
  );
}
