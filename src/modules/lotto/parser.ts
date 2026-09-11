// Pure function only — no server-only, no network — so unit tests can
// import this directly. scraper.ts (server-only) is the only caller.

export interface ScrapedDraw {
  round: number;
  main: [number, number, number, number, number, number];
  bonus: number;
}

// Matches one data row of the results table, e.g.:
// <tr><td>1240</td><td><span class="n2">11</span></td>...(6 numbers)...
// <td><span class="n3">27</span></td><td><a href="/lotto/1240">보기</a></td></tr>
// The 7 <span class="nN"> numbers are the 6 main numbers (already sorted
// ascending in the source) followed by the bonus number.
// [\s\S] instead of a dotAll `.` — the tsconfig target (ES2017) predates
// the `s` regex flag.
const ROW_RE = /<tr><td>(\d+)<\/td>([\s\S]*?)<\/tr>/g;
const NUM_RE = /<span class="n\d">(\d+)<\/span>/g;

export function parseListPageHtml(html: string): ScrapedDraw[] {
  const draws: ScrapedDraw[] = [];
  for (const rowMatch of html.matchAll(ROW_RE)) {
    const round = Number(rowMatch[1]);
    const nums = [...rowMatch[2].matchAll(NUM_RE)].map((m) => Number(m[1]));
    // A real data row has exactly 6 main numbers + 1 bonus; anything else
    // (a header row, a malformed row, a future markup change) is skipped
    // rather than guessed at.
    if (nums.length !== 7 || !Number.isFinite(round)) continue;
    const main = nums.slice(0, 6).sort((a, b) => a - b) as ScrapedDraw["main"];
    draws.push({ round, main, bonus: nums[6] });
  }
  return draws;
}
