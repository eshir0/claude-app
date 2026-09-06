import { requireSessionPage } from "@/lib/auth/guard";
import { getCardStates } from "@/modules/ai-usage/service";
import { CardsView } from "./CardsView";

/**
 * Server Component: owns auth + the initial data fetch. The actual
 * re-fetching (mount/timer/visibility/pageshow) lives in CardsView, a
 * Client Component — see its file comment for why a page-return alone
 * can't be trusted to reflect fresh data.
 */
export default async function CardsWidget() {
  await requireSessionPage();
  const cards = await getCardStates();
  return <CardsView initialStates={cards} />;
}
