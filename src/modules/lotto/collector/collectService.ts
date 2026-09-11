import "server-only";
import { fetchDrawsNewerThan } from "../scraper";
import { getLatestStoredRound, saveNewDraws, ensureComboSetForRound } from "../service";

export type LottoCheckOutcome =
  | { ok: true; newDrawsSaved: number; comboSetRound: number | null }
  | { ok: false; reason: "ERROR"; message: string };

/**
 * Single entry point the background scheduler calls (see
 * instrumentation-node.ts#startLottoScheduler): fetch any draws newer than
 * what's stored, save them, then ensure a combo set exists for the newest
 * known round. Idempotent — ensureComboSetForRound only generates once per
 * round no matter how often this runs (LottoComboSet.forRound is unique),
 * so checking far more often than the weekly draw cadence is harmless.
 */
export async function checkAndUpdateLotto(): Promise<LottoCheckOutcome> {
  try {
    const latestStored = await getLatestStoredRound();
    const newDraws = await fetchDrawsNewerThan(latestStored);
    const savedCount = newDraws.length > 0 ? await saveNewDraws(newDraws) : 0;

    const latestRound = newDraws.length > 0 ? Math.max(...newDraws.map((d) => d.round)) : latestStored;
    if (latestRound === 0) {
      // Nothing stored yet and the scrape itself came back empty (e.g. the
      // site was unreachable on first run) — leave NO_DATA in place rather
      // than generating a combo set for a nonexistent round 0.
      return { ok: true, newDrawsSaved: savedCount, comboSetRound: null };
    }

    await ensureComboSetForRound(latestRound);
    return { ok: true, newDrawsSaved: savedCount, comboSetRound: latestRound };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "ERROR", message };
  }
}
