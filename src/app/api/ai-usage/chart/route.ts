import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { chartQuerySchema } from "@/modules/ai-usage/logic";
import { getChartData } from "@/modules/ai-usage/service";

// Deliberately separate from GET /api/ai-usage: the chart needs the full
// selected time range regardless of what page the history table is on, and
// the history table needs pagination regardless of the chart's selected
// range — coupling them to one query would make one or the other wrong.
export async function GET(req: Request) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  const url = new URL(req.url);
  const parsed = chartQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_ERROR", "Invalid query parameters", parsed.error.flatten());
  }

  const data = await getChartData(parsed.data.metricId, parsed.data.range);
  return NextResponse.json(data);
}
