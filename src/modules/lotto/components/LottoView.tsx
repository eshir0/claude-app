"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { LottoCardState, LottoComboAnnotation } from "../types";
import { Card } from "@/components/ui/Card";
import { Panel } from "@/components/ui/Panel";
import { IconButton } from "@/components/ui/IconButton";

interface LottoViewProps {
  initialState: LottoCardState;
  /** Panel heading (home dashboard only). */
  title?: string;
}

/**
 * No mount/timer/visibility auto-refresh (unlike ai-usage/CardsView) —
 * deliberate: the underlying data changes at most once a week, so polling
 * on the same cadence as a usage dashboard would just be noise. The button
 * only re-reads whatever the background scheduler has already computed; it
 * never triggers a live scrape (see this module's plan doc for why a
 * user-triggered scrape button was deliberately left out).
 */
export function LottoView({ initialState, title }: LottoViewProps) {
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
    <Panel
      title={title}
      description={headerText(state)}
      className="h-full"
      actions={
        <IconButton
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          title="지금 상태 새로고침"
          aria-label="지금 상태 새로고침"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </IconButton>
      }
    >
      {renderBody(state)}
    </Panel>
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
      <Card variant="inset" className="text-sm text-text-muted">
        최초 데이터 수집 후 자동으로 생성됩니다 (서버 시작 후 최대 몇 시간 소요될 수 있음).
      </Card>
    );
  }

  // Sized by the panel (container query): a single column in a narrow
  // home-page bento cell, spreading out when the panel is full-width on
  // the lotto page. Ball size is chosen so all six fit on one line at the
  // narrowest column width each layout allows.
  return (
    <div className="grid grid-cols-1 gap-2 break-keep @xl:grid-cols-2 @5xl:grid-cols-5">
      {state.comboSet.combos.map((combo, i) => (
        <ComboCard key={i} combo={combo} />
      ))}
    </div>
  );
}

function ComboCard({ combo }: { combo: LottoComboAnnotation }) {
  return (
    <Card variant="inset" className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex flex-wrap gap-1">
        {combo.combo.map((n, i) => (
          <span
            key={n}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ backgroundColor: ballColor(n) }}
            title={combo.groups[i]}
          >
            {n}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-text-muted">
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
    </Card>
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
