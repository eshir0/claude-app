"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { LottoCardState, LottoComboAnnotation } from "../types";

interface LottoViewProps {
  initialState: LottoCardState;
}

/**
 * No mount/timer/visibility auto-refresh (unlike ai-usage/CardsView) —
 * deliberate: the underlying data changes at most once a week, so polling
 * on the same cadence as a usage dashboard would just be noise. The button
 * only re-reads whatever the background scheduler has already computed; it
 * never triggers a live scrape (see this module's plan doc for why a
 * user-triggered scrape button was deliberately left out).
 */
export function LottoView({ initialState }: LottoViewProps) {
  const [state, setState] = useState(initialState);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/lotto/cards");
      if (res.ok) setState(await res.json());
    } catch {
      // Transient network error: keep showing the last known state.
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{headerText(state)}</span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          title="지금 상태 새로고침"
          aria-label="지금 상태 새로고침"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
      {renderBody(state)}
    </div>
  );
}

export default LottoView;

function headerText(state: LottoCardState): string {
  if (state.kind === "NO_DATA") return "아직 생성된 조합이 없습니다";
  const roundLabel = `${state.latestRound}회 기준`;
  if (state.kind === "STALE") {
    return `${roundLabel} · 마지막 생성 ${Math.floor(state.ageDays)}일 전 (갱신 지연 중)`;
  }
  return roundLabel;
}

function renderBody(state: LottoCardState) {
  if (state.kind === "NO_DATA") {
    return (
      <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
        최초 데이터 수집 후 자동으로 생성됩니다 (서버 시작 후 최대 몇 시간 소요될 수 있음).
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {state.comboSet.combos.map((combo, i) => (
        <ComboCard key={i} combo={combo} />
      ))}
    </div>
  );
}

function ComboCard({ combo }: { combo: LottoComboAnnotation }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap gap-1.5">
        {combo.combo.map((n, i) => (
          <span
            key={n}
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: ballColor(n) }}
            title={combo.groups[i]}
          >
            {n}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          홀{combo.oddCount}:짝{combo.evenCount} · 저{combo.lowCount}:고{combo.highCount} · 합계 {combo.sum}
        </span>
        {combo.notableSubsets.length > 0 ? (
          combo.notableSubsets.map((s, i) => (
            <span key={i}>
              {s.numbers.join("-")} 함께 {s.count}회 출현
            </span>
          ))
        ) : (
          <span>주목할 부분조합 없음</span>
        )}
      </div>
    </div>
  );
}

// Same tens-digit coloring convention as the official lotto ball.
function ballColor(n: number): string {
  if (n <= 10) return "#fbc400";
  if (n <= 20) return "#69c8f2";
  if (n <= 30) return "#ff7272";
  if (n <= 40) return "#aaaaaa";
  return "#b0d840";
}
