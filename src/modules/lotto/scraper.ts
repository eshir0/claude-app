import "server-only";
import { parseListPageHtml, type ScrapedDraw } from "./parser";

export type { ScrapedDraw };

// superkts.com has no official API — this scrapes its public draw-history
// list page (10 draws per page, most recent first: pg=1 is the latest 10,
// higher pg values go further back). Verified live against the real site
// (2026-09-11): pg=1 returned rounds 1240-1231, pg=2 returned 1230-1221,
// pg=124 returned round 10 down to round 1 — i.e. round = 1240 - 10*(pg-1)
// down to 1231 - 10*(pg-1), consistent with a fixed 10-rows-per-page,
// most-recent-first layout with no gaps.
const LIST_URL = "https://superkts.com/lotto/list/";
// A real browser UA — requests without one have been observed to receive
// tiny/garbled bodies from this endpoint.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MIN_RESPONSE_BYTES = 1000;
const MAX_RETRIES = 3;
const REQUEST_DELAY_MS = 300;
const ROWS_PER_PAGE = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchListPageHtml(pg: number): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1)); // 1s, then 2s
    try {
      const res = await fetch(`${LIST_URL}?pg=${pg}`, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) {
        lastErr = new Error(`superkts.com returned HTTP ${res.status} for pg=${pg}`);
        continue;
      }
      const text = await res.text();
      // A real rate-limiting failure mode observed against this endpoint:
      // a ~3-byte error body with a 200 status under bulk/rapid fetching.
      // Reject anything implausibly small rather than trying to parse it.
      if (text.length < MIN_RESPONSE_BYTES) {
        lastErr = new Error(`superkts.com response too small (${text.length} bytes) for pg=${pg}`);
        continue;
      }
      return text;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Failed to fetch superkts.com list pg=${pg}`);
}

export async function fetchListPage(pg: number): Promise<ScrapedDraw[]> {
  return parseListPageHtml(await fetchListPageHtml(pg));
}

/**
 * Pages back from pg=1 (most recent 10 draws) until every round newer than
 * `knownLatestRound` has been collected. Passing 0 (an empty DB) walks all
 * the way back to round 1 — the first-run full backfill and every later
 * incremental check are the same code path, just with a different starting
 * cursor. Sequential requests with a delay between them, since this is a
 * public HTML page, not a bulk API.
 */
export async function fetchDrawsNewerThan(knownLatestRound: number): Promise<ScrapedDraw[]> {
  const collected: ScrapedDraw[] = [];
  for (let pg = 1; ; pg++) {
    if (pg > 1) await sleep(REQUEST_DELAY_MS);
    const pageDraws = await fetchListPage(pg);
    if (pageDraws.length === 0) break; // ran off the end of the list
    for (const d of pageDraws) {
      if (d.round > knownLatestRound) collected.push(d);
    }
    const oldestOnPage = pageDraws[pageDraws.length - 1].round;
    if (oldestOnPage <= knownLatestRound || pageDraws.length < ROWS_PER_PAGE) break;
  }
  return collected;
}
