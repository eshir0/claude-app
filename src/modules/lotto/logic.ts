// Deliberately NOT `server-only` — no DB/network access here, only pure
// functions and zod schemas, ported 1:1 from a Python prototype that was
// validated against the real 1240-round historical dataset in an earlier
// session (values/thresholds below must never be "improved" independently
// of that validation). service.ts (server-only) calls into this file; unit
// tests import this file directly.
import { z } from "zod";
import type {
  LottoGroupLabel,
  NotableSubset,
  LottoComboAnnotation,
  LottoComboSetDTO,
  LottoCardState,
} from "./types";

export const MAIN_NUMBERS_COUNT = 6;
const NUMBER_MIN = 1;
const NUMBER_MAX = 45;
const GROUP_SIZE = 15; // 45 numbers / 3 groups (high/mid/low frequency)

export interface HistoricalDraw {
  round: number;
  /** The 6 main numbers only — bonus is excluded from every
   * frequency/co-occurrence computation below, matching the original
   * script. */
  main: readonly number[];
}

export interface NumberGroups {
  high: ReadonlySet<number>; // top 15 by all-time frequency
  mid: ReadonlySet<number>; // next 15
  low: ReadonlySet<number>; // bottom 15
}

/**
 * Ranks 1-45 by all-time frequency among `main` numbers (bonus excluded),
 * ties broken by ascending number so the grouping is deterministic even
 * when frequencies collide.
 */
export function buildNumberGroups(draws: readonly HistoricalDraw[]): NumberGroups {
  const freq = new Map<number, number>();
  for (let n = NUMBER_MIN; n <= NUMBER_MAX; n++) freq.set(n, 0);
  for (const draw of draws) {
    for (const n of draw.main) freq.set(n, (freq.get(n) ?? 0) + 1);
  }
  const ranked = Array.from({ length: NUMBER_MAX }, (_, i) => i + 1).sort((a, b) => {
    const diff = (freq.get(b) ?? 0) - (freq.get(a) ?? 0);
    return diff !== 0 ? diff : a - b;
  });
  return {
    high: new Set(ranked.slice(0, GROUP_SIZE)),
    mid: new Set(ranked.slice(GROUP_SIZE, GROUP_SIZE * 2)),
    low: new Set(ranked.slice(GROUP_SIZE * 2, GROUP_SIZE * 3)),
  };
}

export function groupLabel(n: number, groups: NumberGroups): LottoGroupLabel {
  if (groups.high.has(n)) return "빈출";
  if (groups.mid.has(n)) return "중간";
  return "저빈도";
}

function combinations<T>(items: readonly T[], k: number): T[][] {
  const results: T[][] = [];
  function rec(start: number, chosen: T[]) {
    if (chosen.length === k) {
      results.push([...chosen]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      chosen.push(items[i]);
      rec(i + 1, chosen);
      chosen.pop();
    }
  }
  rec(0, []);
  return results;
}

function subsetKey(nums: readonly number[]): string {
  return nums.join(",");
}

export interface SubsetCounts {
  pair: ReadonlyMap<string, number>; // key: subsetKey of 2 sorted numbers
  triple: ReadonlyMap<string, number>; // 3 numbers
  quad: ReadonlyMap<string, number>; // 4 numbers
}

/** All-time pair/triple/quad co-occurrence counts among `main` numbers only. */
export function buildSubsetCounts(draws: readonly HistoricalDraw[]): SubsetCounts {
  const pair = new Map<string, number>();
  const triple = new Map<string, number>();
  const quad = new Map<string, number>();
  for (const draw of draws) {
    const sorted = [...draw.main].sort((a, b) => a - b);
    for (const c of combinations(sorted, 2)) pair.set(subsetKey(c), (pair.get(subsetKey(c)) ?? 0) + 1);
    for (const c of combinations(sorted, 3)) triple.set(subsetKey(c), (triple.get(subsetKey(c)) ?? 0) + 1);
    for (const c of combinations(sorted, 4)) quad.set(subsetKey(c), (quad.get(subsetKey(c)) ?? 0) + 1);
  }
  return { pair, triple, quad };
}

export function buildHistoricalComboSet(draws: readonly HistoricalDraw[]): ReadonlySet<string> {
  return new Set(draws.map((d) => subsetKey([...d.main].sort((a, b) => a - b))));
}

// --- validity rules (ported 1:1 from the validated Python prototype) ---

/** Reject 4 or more consecutive numbers (e.g. 12-13-14-15). */
export function isConsecutiveRunTooLong(nums: readonly number[]): boolean {
  const s = [...nums].sort((a, b) => a - b);
  let run = 1;
  let best = 1;
  for (let i = 1; i < s.length; i++) {
    if (s[i] === s[i - 1] + 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best >= 4;
}

/** Reject a perfect arithmetic sequence (identical gap between every number). */
export function isFixedInterval(nums: readonly number[]): boolean {
  const s = [...nums].sort((a, b) => a - b);
  const diffs = new Set<number>();
  for (let i = 0; i < s.length - 1; i++) diffs.add(s[i + 1] - s[i]);
  return diffs.size === 1;
}

export function isAllUnder32(nums: readonly number[]): boolean {
  return Math.max(...nums) <= 31;
}

/** Reject if any last-digit (0-9) appears 4 or more times. */
export function hasTooManySameLastDigit(nums: readonly number[]): boolean {
  const counts = new Map<number, number>();
  for (const n of nums) {
    const d = n % 10;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return Math.max(...counts.values()) >= 4;
}

/** Position on the official 7-column lotto slip (numbers fill row-wise, 1-45). */
function gridPos(n: number): [row: number, col: number] {
  const idx = n - 1;
  return [Math.floor(idx / 7), idx % 7];
}

/**
 * Reject 6 numbers that form a straight vertical/horizontal line or a
 * diagonal on the official slip grid — visually "lazy" picks that are
 * over-represented among real players' tickets.
 */
export function isStraightOrDiagonal(nums: readonly number[]): boolean {
  const s = [...nums].sort((a, b) => a - b);
  const positions = s.map(gridPos);
  const cols = new Set(positions.map(([, c]) => c));
  const rows = new Set(positions.map(([r]) => r));
  if (cols.size === 1) return true;
  if (rows.size === 1) return true;
  const byRow = [...positions].sort((a, b) => a[0] - b[0]);
  const isDiagDown = byRow.every(
    (p, i) => i === 0 || (p[0] - byRow[i - 1][0] === 1 && p[1] - byRow[i - 1][1] === 1),
  );
  const isDiagUp = byRow.every(
    (p, i) => i === 0 || (p[0] - byRow[i - 1][0] === 1 && p[1] - byRow[i - 1][1] === -1),
  );
  return isDiagDown || isDiagUp;
}

export function oddEvenCounts(nums: readonly number[]): { odd: number; even: number } {
  const odd = nums.filter((n) => n % 2 === 1).length;
  return { odd, even: nums.length - odd };
}

/** Only 2:4, 3:3, or 4:2 odd:even splits are allowed. */
export function oddEvenOk(nums: readonly number[]): boolean {
  const { odd, even } = oddEvenCounts(nums);
  return (odd === 2 && even === 4) || (odd === 3 && even === 3) || (odd === 4 && even === 2);
}

export function lowHighCounts(nums: readonly number[]): { low: number; high: number } {
  const low = nums.filter((n) => n <= 22).length;
  return { low, high: nums.length - low };
}

/** At least 1 and at most 5 of the 6 numbers fall in 1-22 (rejects an all-low or all-high pick). */
export function lowHighOk(nums: readonly number[]): boolean {
  const { low } = lowHighCounts(nums);
  return low >= 1 && low <= 5;
}

export function sumOk(nums: readonly number[]): boolean {
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum >= 100 && sum <= 175;
}

export function isValidCombo(nums: readonly number[], historicalCombos: ReadonlySet<string>): boolean {
  const sorted = [...nums].sort((a, b) => a - b);
  if (historicalCombos.has(subsetKey(sorted))) return false;
  if (isConsecutiveRunTooLong(sorted)) return false;
  if (isFixedInterval(sorted)) return false;
  if (isAllUnder32(sorted)) return false;
  if (hasTooManySameLastDigit(sorted)) return false;
  if (isStraightOrDiagonal(sorted)) return false;
  if (!oddEvenOk(sorted)) return false;
  if (!lowHighOk(sorted)) return false;
  if (!sumOk(sorted)) return false;
  return true;
}

const MAX_GENERATE_ATTEMPTS = 2000;
const TARGET_COMBO_COUNT = 5;
const PICKS_PER_GROUP = 2;

function sampleWithoutReplacement(pool: readonly number[], k: number, rng: () => number): number[] {
  const copy = [...pool];
  const picked: number[] = [];
  for (let i = 0; i < k && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    picked.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return picked;
}

/**
 * Draws 2 numbers from each of high/mid/low, retrying (rejection sampling,
 * capped at 2000 attempts to bound worst-case latency) until a combination
 * passes isValidCombo and hasn't already been generated in this same batch.
 * Returns null if no valid combination was found within the attempt budget
 * — never observed against the real 1240-round dataset, but the caller
 * must handle it rather than loop forever.
 */
export function generateOneCombo(
  groups: NumberGroups,
  historicalCombos: ReadonlySet<string>,
  existingInBatch: ReadonlySet<string>,
  rng: () => number = Math.random,
): number[] | null {
  const highPool = [...groups.high].sort((a, b) => a - b);
  const midPool = [...groups.mid].sort((a, b) => a - b);
  const lowPool = [...groups.low].sort((a, b) => a - b);
  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
    const picks = [
      ...sampleWithoutReplacement(highPool, PICKS_PER_GROUP, rng),
      ...sampleWithoutReplacement(midPool, PICKS_PER_GROUP, rng),
      ...sampleWithoutReplacement(lowPool, PICKS_PER_GROUP, rng),
    ].sort((a, b) => a - b);
    if (new Set(picks).size !== MAIN_NUMBERS_COUNT) continue;
    const key = subsetKey(picks);
    if (existingInBatch.has(key)) continue;
    if (isValidCombo(picks, historicalCombos)) return picks;
  }
  return null;
}

/**
 * Notable pair/triple/quad subsets within `combo` — thresholds (pair >=55,
 * triple >=8, quad >=3) and ordering (biggest subset first, then most
 * co-occurrences) ported as-is from the validated prototype. Top 3 only.
 */
export function notableSubsets(combo: readonly number[], counts: SubsetCounts): NotableSubset[] {
  const sorted = [...combo].sort((a, b) => a - b);
  const found: NotableSubset[] = [];
  for (const c of combinations(sorted, 4)) {
    const count = counts.quad.get(subsetKey(c)) ?? 0;
    if (count >= 3) found.push({ numbers: c, size: 4, count });
  }
  for (const c of combinations(sorted, 3)) {
    const count = counts.triple.get(subsetKey(c)) ?? 0;
    if (count >= 8) found.push({ numbers: c, size: 3, count });
  }
  for (const c of combinations(sorted, 2)) {
    const count = counts.pair.get(subsetKey(c)) ?? 0;
    if (count >= 55) found.push({ numbers: c, size: 2, count });
  }
  found.sort((a, b) => (b.size !== a.size ? b.size - a.size : b.count - a.count));
  return found.slice(0, 3);
}

export function annotateCombo(
  combo: readonly number[],
  groups: NumberGroups,
  historicalCombos: ReadonlySet<string>,
  counts: SubsetCounts,
): LottoComboAnnotation {
  const sorted = [...combo].sort((a, b) => a - b);
  const { odd, even } = oddEvenCounts(sorted);
  const { low, high } = lowHighCounts(sorted);
  return {
    combo: sorted,
    groups: sorted.map((n) => groupLabel(n, groups)),
    oddCount: odd,
    evenCount: even,
    lowCount: low,
    highCount: high,
    sum: sorted.reduce((a, b) => a + b, 0),
    isHistoricalDuplicate: historicalCombos.has(subsetKey(sorted)),
    notableSubsets: notableSubsets(sorted, counts),
  };
}

export interface GeneratedComboSet {
  combos: LottoComboAnnotation[];
  randomPickIndex: number;
}

/**
 * Generates TARGET_COMBO_COUNT (5) distinct valid combinations plus a
 * uniformly random "pick of the day" index — mirrors the original script's
 * `while len(results) < 5` loop and its `random.randrange` pick exactly.
 */
export function generateComboSet(
  draws: readonly HistoricalDraw[],
  rng: () => number = Math.random,
): GeneratedComboSet {
  const groups = buildNumberGroups(draws);
  const historicalCombos = buildHistoricalComboSet(draws);
  const counts = buildSubsetCounts(draws);
  const existing = new Set<string>();
  const combos: LottoComboAnnotation[] = [];
  // Bounded overall retry budget (generateOneCombo already caps its own
  // attempts) so a pathological input can never hang the scheduler tick.
  let guard = TARGET_COMBO_COUNT * MAX_GENERATE_ATTEMPTS;
  while (combos.length < TARGET_COMBO_COUNT && guard-- > 0) {
    const picks = generateOneCombo(groups, historicalCombos, existing, rng);
    if (!picks) continue;
    existing.add(subsetKey(picks));
    combos.push(annotateCombo(picks, groups, historicalCombos, counts));
  }
  if (combos.length < TARGET_COMBO_COUNT) {
    throw new Error(`Could not generate ${TARGET_COMBO_COUNT} valid combinations within the attempt budget`);
  }
  const randomPickIndex = Math.floor(rng() * combos.length);
  return { combos, randomPickIndex };
}

// --- storage validation (JSON blob read back from LottoComboSet.combosJson) ---

const notableSubsetSchema = z.object({
  numbers: z.array(z.number().int()),
  size: z.number().int(),
  count: z.number().int(),
});

const comboAnnotationSchema = z.object({
  combo: z.array(z.number().int()).length(MAIN_NUMBERS_COUNT),
  groups: z.array(z.enum(["빈출", "중간", "저빈도"])).length(MAIN_NUMBERS_COUNT),
  oddCount: z.number().int(),
  evenCount: z.number().int(),
  lowCount: z.number().int(),
  highCount: z.number().int(),
  sum: z.number().int(),
  isHistoricalDuplicate: z.boolean(),
  notableSubsets: z.array(notableSubsetSchema),
});

export const comboSetPayloadSchema = z.array(comboAnnotationSchema).length(TARGET_COMBO_COUNT);

// --- card state ---

// A week plus slack, so a systemd restart / brief downtime around the
// weekly draw doesn't immediately flip the card to "stale".
const STALE_THRESHOLD_DAYS = 9;

/** `now` is injectable for deterministic tests. */
export function computeLottoCardState(
  latestRound: number | null,
  comboSet: LottoComboSetDTO | null,
  now: Date = new Date(),
): LottoCardState {
  if (!comboSet) return { kind: "NO_DATA" };
  const ageDays = (now.getTime() - new Date(comboSet.generatedAt).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays > STALE_THRESHOLD_DAYS) {
    return { kind: "STALE", comboSet, latestRound: latestRound ?? comboSet.forRound, ageDays };
  }
  return { kind: "OK", comboSet, latestRound: latestRound ?? comboSet.forRound };
}
