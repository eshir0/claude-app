import "server-only";
import { getValidAccessToken, recordCollectionResult } from "./connectionService.ts";
import { fetchCodexUsage } from "./usageApi.ts";
import { mapCodexUsageToEntries } from "./logic.ts";
import { createUsageEntry } from "../service.ts";
import type { AiUsageEntryDTO } from "../types.ts";

export type CollectOutcome =
  | { ok: true; status: number; body: unknown; savedEntries: AiUsageEntryDTO[] }
  | { ok: false; reason: "NOT_CONNECTED" }
  | { ok: false; reason: "FETCH_FAILED"; status: number; body: unknown }
  | { ok: false; reason: "ERROR"; message: string };

/**
 * Fetches /backend-api/wham/usage, maps the confirmed rate_limit.
 * primary_window/secondary_window fields to chatgpt_codex_5h_window /
 * chatgpt_codex_weekly (see logic.ts mapCodexUsageToEntries — mapping
 * verified against a real observed response, not guessed), and saves each
 * as an AUTO entry via the same service layer manual entry used to use.
 *
 * Shared by the manual "지금 수집" API route AND the background poller
 * (see instrumentation-node.ts) — both must behave identically, so neither
 * duplicates this logic.
 */
export async function collectAndSaveCodexUsage(): Promise<CollectOutcome> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return { ok: false, reason: "NOT_CONNECTED" };

  try {
    const result = await fetchCodexUsage(accessToken);
    await recordCollectionResult(
      result.ok ? { ok: true } : { ok: false, error: `HTTP ${result.status}` },
    );
    if (!result.ok) {
      return { ok: false, reason: "FETCH_FAILED", status: result.status, body: result.body };
    }

    // Same recordedAt for every window from this one API call — they were
    // all observed at the same instant, not fetched independently.
    const recordedAt = new Date();
    const mapped = mapCodexUsageToEntries(result.body);
    const savedEntries: AiUsageEntryDTO[] = [];
    for (const entry of mapped) {
      const saved = await createUsageEntry(
        {
          metricId: entry.metricId,
          usagePercent: entry.usagePercent,
          recordedAt: recordedAt.toISOString(),
          resetsAt: entry.resetsAt.toISOString(),
        },
        "AUTO",
      );
      savedEntries.push(saved);
    }

    return { ok: true, status: result.status, body: result.body, savedEntries };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordCollectionResult({ ok: false, error: message });
    return { ok: false, reason: "ERROR", message };
  }
}
