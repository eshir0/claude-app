import "server-only";
import { prisma } from "@/lib/prisma";
import type { GeoLookupStatus } from "@/generated/prisma/client";
import { mergeIpSummaries } from "./logic";
import type { IpSummaryDTO, AccessLogEntryDTO } from "./types";

// This is the ONLY module that touches Prisma for access-log data.

const RESOLVED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FAILED_BACKOFF_MS = 60 * 60 * 1000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES_PER_IP = 10_000;

export interface RecordAccessLogEntryInput {
  source: string;
  ip: string;
  method: string;
  path: string;
  userAgent?: string;
}

/**
 * `at` is always this server's own clock, never a client-supplied value —
 * the ingest payload doesn't even carry one (see the plan doc's rationale:
 * synchronous fire-and-forget over a LAN, no queueing/replay to justify
 * trusting a remote clock).
 */
export async function recordAccessLogEntry(input: RecordAccessLogEntryInput): Promise<void> {
  await prisma.accessLogEntry.create({
    data: {
      source: input.source,
      ip: input.ip,
      method: input.method,
      path: input.path,
      userAgent: input.userAgent ?? null,
    },
  });
}

/**
 * Three separate queries merged in JS (see logic.ts#mergeIpSummaries) —
 * SQLite/Prisma groupBy can't join across models in one call.
 */
export async function getIpSummaries(limit = 50): Promise<IpSummaryDTO[]> {
  const counts = await prisma.accessLogEntry.groupBy({
    by: ["ip"],
    _count: { _all: true },
    _min: { at: true },
    _max: { at: true },
    orderBy: { _max: { at: "desc" } },
    take: limit,
  });
  const ips = counts.map((c) => c.ip);
  if (ips.length === 0) return [];

  const [sourceRows, geoRows] = await Promise.all([
    prisma.accessLogEntry.groupBy({ by: ["ip", "source"], where: { ip: { in: ips } } }),
    prisma.ipGeoCache.findMany({ where: { ip: { in: ips } } }),
  ]);

  const merged = mergeIpSummaries(
    counts.map((c) => ({
      ip: c.ip,
      hitCount: c._count._all,
      firstSeen: c._min.at!,
      lastSeen: c._max.at!,
    })),
    sourceRows.map((r) => ({ ip: r.ip, source: r.source })),
    geoRows.map((r) => ({ ip: r.ip, status: r.status, country: r.country, city: r.city })),
  );

  return merged.map((m) => ({
    ip: m.ip,
    sources: m.sources,
    country: m.country,
    city: m.city,
    hitCount: m.hitCount,
    firstSeen: m.firstSeen.toISOString(),
    lastSeen: m.lastSeen.toISOString(),
  }));
}

export async function getEntriesForIp(ip: string, limit = 100): Promise<AccessLogEntryDTO[]> {
  const rows = await prisma.accessLogEntry.findMany({
    where: { ip },
    orderBy: { at: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    method: r.method,
    path: r.path,
    userAgent: r.userAgent,
    at: r.at.toISOString(),
  }));
}

/** Deletes AccessLogEntry rows older than the 90-day retention window. */
export async function pruneOldAccessLogEntries(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const result = await prisma.accessLogEntry.deleteMany({ where: { at: { lt: cutoff } } });
  return result.count;
}

/**
 * For any ip that has accumulated more than MAX_ENTRIES_PER_IP rows (a
 * tightly-polled endpoint can otherwise reach that well within the 90-day
 * retention window), keeps only its single most recent row and deletes the
 * rest — hitCount, firstSeen, and lastSeen are all derived from the row set
 * (see getIpSummaries), so this is what resets all three at once. Returns
 * the ips that were reset, for observability.
 */
export async function resetOversizedIpHistories(threshold = MAX_ENTRIES_PER_IP): Promise<string[]> {
  const counts = await prisma.accessLogEntry.groupBy({ by: ["ip"], _count: { _all: true } });
  const oversizedIps = counts.filter((c) => c._count._all > threshold).map((c) => c.ip);

  for (const ip of oversizedIps) {
    const latest = await prisma.accessLogEntry.findFirst({ where: { ip }, orderBy: { at: "desc" } });
    if (!latest) continue;
    await prisma.accessLogEntry.deleteMany({ where: { ip, id: { not: latest.id } } });
  }

  return oversizedIps;
}

/**
 * Deletes every AccessLogEntry row for one ip (manual "forget this IP"
 * action from the dashboard) plus its IpGeoCache row, so it disappears
 * immediately instead of lingering as an orphan until the next
 * deleteOrphanedGeoCache maintenance tick.
 */
export async function deleteIpHistory(ip: string): Promise<void> {
  await prisma.accessLogEntry.deleteMany({ where: { ip } });
  await prisma.ipGeoCache.deleteMany({ where: { ip } });
}

/**
 * Deletes IpGeoCache rows for IPs with no remaining AccessLogEntry row —
 * run right after pruning, so a resolved location doesn't keep consuming
 * GeoIP quota (or DB space) for an IP the dashboard no longer shows at all.
 */
export async function deleteOrphanedGeoCache(): Promise<number> {
  const activeIpRows = await prisma.accessLogEntry.findMany({ distinct: ["ip"], select: { ip: true } });
  const activeIps = activeIpRows.map((r) => r.ip);
  // An empty active set means every cached ip is orphaned — delete all of them.
  const result =
    activeIps.length > 0
      ? await prisma.ipGeoCache.deleteMany({ where: { ip: { notIn: activeIps } } })
      : await prisma.ipGeoCache.deleteMany();
  return result.count;
}

/**
 * Candidates for a GeoIP lookup this tick, already intersected with
 * currently-active IPs (an IP with no retained access entry is never a
 * candidate — see deleteOrphanedGeoCache above for why that matters) and
 * capped at `maxCount`. Priority: never-looked-up IPs first (so a new
 * visitor's location fills in promptly), then FAILED past backoff, then
 * stale RESOLVED refreshes last (they already show a value).
 */
export async function getGeoResolutionCandidates(maxCount: number, now: Date = new Date()): Promise<string[]> {
  const activeIpRows = await prisma.accessLogEntry.findMany({ distinct: ["ip"], select: { ip: true } });
  const activeIps = activeIpRows.map((r) => r.ip);
  if (activeIps.length === 0) return [];

  const cachedRows = await prisma.ipGeoCache.findMany({ where: { ip: { in: activeIps } } });
  const cachedByIp = new Map(cachedRows.map((r) => [r.ip, r]));

  const unseen: string[] = [];
  const failedRetryable: string[] = [];
  const resolvedStale: string[] = [];

  for (const ip of activeIps) {
    const cached = cachedByIp.get(ip);
    if (!cached) {
      unseen.push(ip);
      continue;
    }
    const age = now.getTime() - cached.lastCheckedAt.getTime();
    if (cached.status === "FAILED" && age >= FAILED_BACKOFF_MS) {
      failedRetryable.push(ip);
    } else if (cached.status === "RESOLVED" && age >= RESOLVED_TTL_MS) {
      resolvedStale.push(ip);
    }
    // NOT_APPLICABLE is never a candidate, at any age.
  }

  return [...unseen, ...failedRetryable, ...resolvedStale].slice(0, maxCount);
}

export interface GeoLookupResult {
  status: GeoLookupStatus;
  country: string | null;
  city: string | null;
}

export async function upsertGeoCache(ip: string, result: GeoLookupResult, now: Date = new Date()): Promise<void> {
  await prisma.ipGeoCache.upsert({
    where: { ip },
    create: { ip, status: result.status, country: result.country, city: result.city, lastCheckedAt: now },
    update: { status: result.status, country: result.country, city: result.city, lastCheckedAt: now },
  });
}
