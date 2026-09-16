import "server-only";
import { fetchIpGeo } from "./ipGeoApi";
import {
  getGeoResolutionCandidates,
  upsertGeoCache,
  pruneOldAccessLogEntries,
  resetOversizedIpHistories,
  deleteOrphanedGeoCache,
} from "../service";
import { isGeoIpEligiblePublicAddress } from "../logic";

const MAX_GEO_LOOKUPS_PER_TICK = 5;
const DEFAULT_PROVIDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_PROVIDER_COOLDOWN_MS = 48 * 60 * 60 * 1000;

// Module-level, in-memory, process-lifetime state — a restart losing this
// and risking one more 429 is an accepted trade-off at this scale (see the
// plan doc); no DB table exists for this on purpose.
let providerCooldownUntil = 0;

export interface AccessLogMaintenanceResult {
  prunedEntries: number;
  /** ips reset back to a single row for having passed MAX_ENTRIES_PER_IP. */
  resetIps: string[];
  deletedOrphanCacheRows: number;
  /** External provider lookups actually made this tick (never counts a
   * locally-classified NOT_APPLICABLE, which never touches the network). */
  lookupsAttempted: number;
  inProviderCooldown: boolean;
}

/**
 * Single entry point the background scheduler calls (see
 * instrumentation-node.ts#startAccessLogGeoResolver): prune old log rows,
 * reset any ip that's piled up past MAX_ENTRIES_PER_IP, clean up orphaned
 * geo-cache rows, then (unless the provider is in a whole-provider cooldown
 * from a prior 429) resolve up to MAX_GEO_LOOKUPS_PER_TICK candidate IPs.
 * Never throws — errors from a single IP's lookup are recorded as FAILED
 * and the loop continues.
 */
export async function runAccessLogMaintenance(now: Date = new Date()): Promise<AccessLogMaintenanceResult> {
  const prunedEntries = await pruneOldAccessLogEntries(now);
  const resetIps = await resetOversizedIpHistories();
  const deletedOrphanCacheRows = await deleteOrphanedGeoCache();

  if (now.getTime() < providerCooldownUntil) {
    return { prunedEntries, resetIps, deletedOrphanCacheRows, lookupsAttempted: 0, inProviderCooldown: true };
  }

  const candidates = await getGeoResolutionCandidates(MAX_GEO_LOOKUPS_PER_TICK, now);
  let lookupsAttempted = 0;

  for (const ip of candidates) {
    if (!isGeoIpEligiblePublicAddress(ip)) {
      await upsertGeoCache(ip, { status: "NOT_APPLICABLE", country: null, city: null }, now);
      continue;
    }

    lookupsAttempted++;
    let result;
    try {
      result = await fetchIpGeo(ip);
    } catch {
      await upsertGeoCache(ip, { status: "FAILED", country: null, city: null }, now);
      continue;
    }

    if (result.outcome === "rate_limited") {
      // A 429 is a fact about the provider, not about this specific ip —
      // its own cache state (or lack of one) is left untouched, to be
      // retried normally once the cooldown clears.
      const cooldownMs = result.retryAfterMs ?? DEFAULT_PROVIDER_COOLDOWN_MS;
      providerCooldownUntil = now.getTime() + Math.min(cooldownMs, MAX_PROVIDER_COOLDOWN_MS);
      break;
    }
    if (result.outcome === "resolved") {
      await upsertGeoCache(ip, { status: "RESOLVED", country: result.country, city: result.city }, now);
    } else if (result.outcome === "not_applicable") {
      await upsertGeoCache(ip, { status: "NOT_APPLICABLE", country: null, city: null }, now);
    } else {
      await upsertGeoCache(ip, { status: "FAILED", country: null, city: null }, now);
    }
  }

  return { prunedEntries, resetIps, deletedOrphanCacheRows, lookupsAttempted, inProviderCooldown: false };
}
