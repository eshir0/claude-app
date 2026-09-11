import { requireSessionPage } from "@/lib/auth/guard";
import { getCardState } from "@/modules/lotto/service";
import { LottoView } from "./LottoView";

/**
 * Server Component: owns auth + the initial data fetch. Unlike
 * ai-usage/CardsWidget, this never triggers a live collect on mount — the
 * data only changes once a week (after the Saturday draw), so the
 * background scheduler (instrumentation-node.ts#startLottoScheduler) is
 * solely responsible for keeping it fresh; the widget only reads what's
 * already stored.
 */
export default async function LottoWidget() {
  await requireSessionPage();
  const state = await getCardState();
  return <LottoView initialState={state} />;
}
