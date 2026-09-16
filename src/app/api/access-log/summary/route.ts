import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { getIpSummaries } from "@/modules/access-log/service";

export async function GET(req: Request) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  const minHitCountParam = new URL(req.url).searchParams.get("minHitCount");
  const minHitCount = minHitCountParam ? Number(minHitCountParam) : 0;
  if (minHitCountParam && (!Number.isFinite(minHitCount) || minHitCount < 0)) {
    return jsonError(400, "INVALID_MIN_HIT_COUNT", "minHitCount must be a non-negative number");
  }

  const summaries = await getIpSummaries(50, minHitCount);
  return NextResponse.json(summaries);
}
