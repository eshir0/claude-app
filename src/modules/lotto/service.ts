import "server-only";
import { prisma } from "@/lib/prisma";
import type { LottoDraw } from "@/generated/prisma/client";
import type { ScrapedDraw } from "./scraper";
import { generateComboSet, comboSetPayloadSchema, computeLottoCardState, type HistoricalDraw } from "./logic";
import type { LottoComboSetDTO, LottoCardState } from "./types";

// This is the ONLY module that touches Prisma for lotto data.

function toHistoricalDraw(
  row: Pick<LottoDraw, "round" | "n1" | "n2" | "n3" | "n4" | "n5" | "n6">,
): HistoricalDraw {
  return { round: row.round, main: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6] };
}

export async function getLatestStoredRound(): Promise<number> {
  const latest = await prisma.lottoDraw.findFirst({ orderBy: { round: "desc" } });
  return latest?.round ?? 0;
}

/**
 * Idempotent per round (`round @unique`) — re-saving an already-stored
 * round is silently skipped rather than erroring, so an overlapping/retried
 * check never fails on a duplicate.
 */
export async function saveNewDraws(draws: readonly ScrapedDraw[]): Promise<number> {
  let saved = 0;
  for (const d of draws) {
    try {
      await prisma.lottoDraw.create({
        data: {
          round: d.round,
          n1: d.main[0],
          n2: d.main[1],
          n3: d.main[2],
          n4: d.main[3],
          n5: d.main[4],
          n6: d.main[5],
          bonus: d.bonus,
        },
      });
      saved++;
    } catch (err) {
      // P2002 = unique constraint violation (round already stored) —
      // expected when two checks overlap, not an error.
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") continue;
      throw err;
    }
  }
  return saved;
}

async function getAllHistoricalDraws(): Promise<HistoricalDraw[]> {
  const rows = await prisma.lottoDraw.findMany({ orderBy: { round: "asc" } });
  return rows.map(toHistoricalDraw);
}

function toDTO(forRound: number, combosJson: string, randomPickIndex: number, generatedAt: Date): LottoComboSetDTO {
  const combos = comboSetPayloadSchema.parse(JSON.parse(combosJson));
  return { forRound, combos, randomPickIndex, generatedAt: generatedAt.toISOString() };
}

/**
 * Generates and saves a combo set for `round` if one doesn't already exist.
 * `forRound @unique` is the real safety net (a concurrent call racing this
 * one still can't produce two rows for the same round); the existence
 * check up front just avoids wasted random generation on the common case.
 */
export async function ensureComboSetForRound(round: number): Promise<LottoComboSetDTO> {
  const existing = await prisma.lottoComboSet.findUnique({ where: { forRound: round } });
  if (existing) {
    return toDTO(existing.forRound, existing.combosJson, existing.randomPickIndex, existing.generatedAt);
  }

  const draws = await getAllHistoricalDraws();
  const { combos, randomPickIndex } = generateComboSet(draws);
  const combosJson = JSON.stringify(combos);

  try {
    const created = await prisma.lottoComboSet.create({
      data: { forRound: round, combosJson, randomPickIndex },
    });
    return toDTO(created.forRound, created.combosJson, created.randomPickIndex, created.generatedAt);
  } catch (err) {
    // Lost a race to another concurrent call — read back what it saved
    // rather than erroring, so this never fails just because two scheduler
    // ticks overlapped.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      const row = await prisma.lottoComboSet.findUniqueOrThrow({ where: { forRound: round } });
      return toDTO(row.forRound, row.combosJson, row.randomPickIndex, row.generatedAt);
    }
    throw err;
  }
}

export async function getLatestComboSet(): Promise<LottoComboSetDTO | null> {
  const row = await prisma.lottoComboSet.findFirst({ orderBy: { forRound: "desc" } });
  if (!row) return null;
  return toDTO(row.forRound, row.combosJson, row.randomPickIndex, row.generatedAt);
}

export async function getCardState(now: Date = new Date()): Promise<LottoCardState> {
  const [latestRound, comboSet] = await Promise.all([getLatestStoredRound(), getLatestComboSet()]);
  return computeLottoCardState(latestRound || null, comboSet, now);
}
