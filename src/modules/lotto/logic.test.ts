import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildNumberGroups,
  buildSubsetCounts,
  buildHistoricalComboSet,
  isConsecutiveRunTooLong,
  isFixedInterval,
  isAllUnder32,
  hasTooManySameLastDigit,
  isStraightOrDiagonal,
  oddEvenOk,
  lowHighOk,
  sumOk,
  isValidCombo,
  generateOneCombo,
  generateComboSet,
  notableSubsets,
  computeLottoCardState,
  comboSetPayloadSchema,
  type HistoricalDraw,
} from "./logic.ts";
import type { LottoComboSetDTO } from "./types.ts";

// A small synthetic draw history — not real data, but enough to exercise
// grouping, co-occurrence counting, and every validity rule deterministically.
const DRAWS: HistoricalDraw[] = [
  { round: 1, main: [1, 2, 3, 4, 5, 6] },
  { round: 2, main: [1, 2, 3, 4, 5, 7] },
  { round: 3, main: [1, 2, 3, 4, 6, 7] },
  { round: 4, main: [10, 20, 30, 40, 41, 45] },
];

describe("buildNumberGroups", () => {
  test("ranks by descending frequency, ties broken by ascending number", () => {
    const groups = buildNumberGroups(DRAWS);
    // 1,2,3,4 each appear 3x — the most frequent numbers in this fixture.
    assert.ok(groups.high.has(1));
    assert.ok(groups.high.has(2));
    assert.ok(groups.high.has(3));
    assert.ok(groups.high.has(4));
    assert.equal(groups.high.size, 15);
    assert.equal(groups.mid.size, 15);
    assert.equal(groups.low.size, 15);
    // Every number 1-45 appears in exactly one group.
    const all = new Set([...groups.high, ...groups.mid, ...groups.low]);
    assert.equal(all.size, 45);
  });

  test("numbers that never appear all rank equally (0 frequency), tie-broken ascending", () => {
    const groups = buildNumberGroups([]);
    assert.deepEqual([...groups.high].sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i + 1));
  });
});

describe("buildSubsetCounts / buildHistoricalComboSet", () => {
  test("counts pair/triple/quad co-occurrences across main numbers only", () => {
    const counts = buildSubsetCounts(DRAWS);
    // 1,2,3 co-occur in draws 1, 2, and 3 = 3 times.
    assert.equal(counts.triple.get("1,2,3"), 3);
    // 1,2 co-occur in all 3 of the first draws.
    assert.equal(counts.pair.get("1,2"), 3);
    // A pair that never co-occurs is simply absent (undefined), not 0.
    // 1 only appears in draws 1-3, 20 only in draw 4, so they never co-occur.
    assert.equal(counts.pair.get("1,20"), undefined);
  });

  test("historical combo set matches on the full sorted 6-number set only", () => {
    const historical = buildHistoricalComboSet(DRAWS);
    assert.ok(historical.has("1,2,3,4,5,6"));
    assert.ok(!historical.has("1,2,3,4,5,9")); // never drawn, sanity check
    assert.equal(historical.size, DRAWS.length);
  });
});

describe("validity rules", () => {
  test("isConsecutiveRunTooLong rejects runs of 4+", () => {
    assert.equal(isConsecutiveRunTooLong([1, 2, 3, 4, 10, 20]), true);
    assert.equal(isConsecutiveRunTooLong([1, 2, 3, 10, 20, 30]), false);
  });

  test("isFixedInterval rejects a perfect arithmetic sequence", () => {
    assert.equal(isFixedInterval([5, 10, 15, 20, 25, 30]), true);
    assert.equal(isFixedInterval([5, 10, 15, 20, 25, 31]), false);
  });

  test("isAllUnder32 rejects when the max number is <= 31", () => {
    assert.equal(isAllUnder32([1, 5, 10, 15, 20, 31]), true);
    assert.equal(isAllUnder32([1, 5, 10, 15, 20, 32]), false);
  });

  test("hasTooManySameLastDigit rejects 4+ numbers sharing a last digit", () => {
    assert.equal(hasTooManySameLastDigit([1, 11, 21, 31, 5, 6]), true);
    assert.equal(hasTooManySameLastDigit([1, 11, 21, 5, 6, 7]), false);
  });

  test("isStraightOrDiagonal rejects a vertical line on the 7-column slip grid", () => {
    // Column 0 of each row: 1, 8, 15, 22, 29, 36 (idx%7===0).
    assert.equal(isStraightOrDiagonal([1, 8, 15, 22, 29, 36]), true);
  });

  test("isStraightOrDiagonal rejects a horizontal line (all in row 0, numbers 1-7)", () => {
    assert.equal(isStraightOrDiagonal([1, 2, 3, 4, 5, 6]), true);
  });

  test("isStraightOrDiagonal accepts a scattered combination", () => {
    assert.equal(isStraightOrDiagonal([1, 9, 23, 30, 38, 45]), false);
  });

  test("oddEvenOk only allows 2:4, 3:3, 4:2 splits", () => {
    assert.equal(oddEvenOk([1, 3, 5, 2, 4, 6]), true); // 3:3
    assert.equal(oddEvenOk([1, 3, 5, 7, 9, 2]), false); // 5:1
  });

  test("lowHighOk requires 1-5 numbers <= 22", () => {
    assert.equal(lowHighOk([1, 2, 3, 4, 5, 6]), false); // 6 low -> rejected
    assert.equal(lowHighOk([1, 2, 3, 4, 5, 30]), true); // 5 low, 1 high -> ok
  });
  test("lowHighOk rejects all-low (6 of 6 <= 22)", () => {
    assert.equal(lowHighOk([1, 2, 3, 4, 5, 6]), false);
  });
  test("lowHighOk rejects all-high (0 of 6 <= 22)", () => {
    assert.equal(lowHighOk([23, 24, 25, 26, 27, 28]), false);
  });

  test("sumOk requires sum in [100, 175]", () => {
    assert.equal(sumOk([1, 2, 3, 4, 5, 6]), false); // sum 21
    assert.equal(sumOk([10, 15, 20, 25, 30, 35]), true); // sum 135
    assert.equal(sumOk([40, 41, 42, 43, 44, 45]), false); // sum 255
  });

  test("isValidCombo rejects an exact historical duplicate", () => {
    const historical = buildHistoricalComboSet(DRAWS);
    assert.equal(isValidCombo([1, 2, 3, 4, 5, 6], historical), false);
  });

  test("isValidCombo accepts a combination passing every rule and not seen historically", () => {
    const historical = buildHistoricalComboSet(DRAWS);
    // odd:even 3:3 (9,16,23 odd... wait compute), sum in range, no run>=4,
    // not fixed interval, max>31, no last-digit>=4, not a grid line.
    const candidate = [3, 9, 16, 23, 34, 41];
    assert.equal(isValidCombo(candidate, historical), true);
  });
});

describe("generateOneCombo / generateComboSet", () => {
  test("generateOneCombo returns 6 unique sorted numbers, 2 from each group", () => {
    const groups = buildNumberGroups(DRAWS);
    const historical = buildHistoricalComboSet(DRAWS);
    const combo = generateOneCombo(groups, historical, new Set(), () => 0.5);
    assert.ok(combo);
    assert.equal(combo!.length, 6);
    assert.equal(new Set(combo).size, 6);
    assert.deepEqual(
      combo,
      [...combo!].sort((a, b) => a - b),
    );
    const inGroup = (n: number) => (groups.high.has(n) ? "h" : groups.mid.has(n) ? "m" : "l");
    const counts = { h: 0, m: 0, l: 0 };
    for (const n of combo!) counts[inGroup(n)]++;
    assert.deepEqual(counts, { h: 2, m: 2, l: 2 });
  });

  test("generateComboSet produces 5 distinct valid combinations and a valid random pick index", () => {
    // A fixed deterministic RNG sequence makes this reproducible: cycles
    // through values so repeated sampling doesn't get stuck picking the
    // exact same numbers every attempt.
    let i = 0;
    const seq = [0.05, 0.95, 0.15, 0.85, 0.25, 0.75, 0.35, 0.65, 0.45, 0.55, 0.5, 0.6, 0.4, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9, 0.0];
    const rng = () => {
      const v = seq[i % seq.length];
      i++;
      return v;
    };
    const { combos, randomPickIndex } = generateComboSet(DRAWS, rng);
    assert.equal(combos.length, 5);
    const keys = new Set(combos.map((c) => c.combo.join(",")));
    assert.equal(keys.size, 5, "all 5 combos must be distinct");
    for (const c of combos) {
      assert.equal(c.combo.length, 6);
      assert.equal(c.isHistoricalDuplicate, false);
    }
    assert.ok(randomPickIndex >= 0 && randomPickIndex < 5);
  });
});

describe("notableSubsets", () => {
  test("finds a pair meeting the >=55 threshold and reports it", () => {
    const pair = new Map([["1,2", 60]]);
    const counts = { pair, triple: new Map(), quad: new Map() };
    const notes = notableSubsets([1, 2, 10, 20, 30, 40], counts);
    assert.equal(notes.length, 1);
    assert.deepEqual(notes[0], { numbers: [1, 2], size: 2, count: 60 });
  });

  test("prefers larger subsets first, then higher counts, capped at 3", () => {
    const pair = new Map([
      ["1,2", 100],
      ["3,4", 90],
    ]);
    const triple = new Map([["1,2,3", 10]]);
    const counts = { pair, triple, quad: new Map() };
    const notes = notableSubsets([1, 2, 3, 4, 5, 6], counts);
    assert.equal(notes[0].size, 3); // the triple ranks first despite lower "count"
    assert.ok(notes.length <= 3);
  });

  test("returns empty when nothing meets any threshold", () => {
    const counts = { pair: new Map(), triple: new Map(), quad: new Map() };
    assert.deepEqual(notableSubsets([1, 2, 3, 4, 5, 6], counts), []);
  });
});

describe("computeLottoCardState", () => {
  function comboSet(overrides: Partial<LottoComboSetDTO> = {}): LottoComboSetDTO {
    return {
      forRound: 100,
      combos: [],
      randomPickIndex: 0,
      generatedAt: "2026-09-06T00:00:00Z",
      ...overrides,
    };
  }

  test("NO_DATA when no combo set exists yet", () => {
    assert.deepEqual(computeLottoCardState(null, null), { kind: "NO_DATA" });
  });

  test("OK when generated recently", () => {
    const now = new Date("2026-09-08T00:00:00Z"); // 2 days later
    const state = computeLottoCardState(100, comboSet(), now);
    assert.equal(state.kind, "OK");
  });

  test("STALE past the 9-day threshold", () => {
    const now = new Date("2026-09-20T00:00:00Z"); // 14 days later
    const state = computeLottoCardState(100, comboSet(), now);
    assert.equal(state.kind, "STALE");
    if (state.kind === "STALE") {
      assert.ok(state.ageDays > 9);
    }
  });
});

describe("comboSetPayloadSchema", () => {
  test("round-trips a freshly generated combo set through JSON", () => {
    // A constant rng would make generateOneCombo produce the same picks
    // every attempt, so it could never reach 5 *distinct* combos — cycle
    // through varied values instead, as in the generateComboSet test above.
    let i = 0;
    const seq = [0.05, 0.95, 0.15, 0.85, 0.25, 0.75, 0.35, 0.65, 0.45, 0.55, 0.5, 0.6, 0.4, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9, 0.0];
    const rng = () => {
      const v = seq[i % seq.length];
      i++;
      return v;
    };
    const { combos } = generateComboSet(DRAWS, rng);
    const json = JSON.stringify(combos);
    const parsed = comboSetPayloadSchema.parse(JSON.parse(json));
    assert.equal(parsed.length, 5);
  });

  test("rejects a payload with the wrong number of combos", () => {
    assert.throws(() => comboSetPayloadSchema.parse([]));
  });
});
