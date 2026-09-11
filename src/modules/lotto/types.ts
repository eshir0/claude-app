/** Wire/DTO shape — dates are ISO strings, never Prisma Date objects. */
export interface LottoDrawDTO {
  round: number;
  main: [number, number, number, number, number, number];
  bonus: number;
  fetchedAt: string;
}

export type LottoGroupLabel = "빈출" | "중간" | "저빈도";

export interface NotableSubset {
  numbers: number[];
  size: number;
  /** How many historical draws contained every number in `numbers` together (main numbers only, bonus excluded). */
  count: number;
}

/**
 * One of the 5 generated combinations, carrying the same annotations the
 * original one-off script printed: group label per number, odd/even split,
 * low/high split, sum, historical-exact-match flag, notable subsets.
 * `isHistoricalDuplicate` is always false for freshly generated combos
 * (generation itself excludes historical exact matches — see
 * logic.ts#isValidCombo) but is stored/displayed anyway since it was part
 * of the original script's output.
 */
export interface LottoComboAnnotation {
  combo: number[];
  groups: LottoGroupLabel[];
  oddCount: number;
  evenCount: number;
  lowCount: number;
  highCount: number;
  sum: number;
  isHistoricalDuplicate: boolean;
  notableSubsets: NotableSubset[];
}

export interface LottoComboSetDTO {
  forRound: number;
  combos: LottoComboAnnotation[];
  randomPickIndex: number;
  generatedAt: string;
}

export type LottoCardState =
  | { kind: "NO_DATA" }
  | { kind: "OK"; comboSet: LottoComboSetDTO; latestRound: number }
  | { kind: "STALE"; comboSet: LottoComboSetDTO; latestRound: number; ageDays: number };
