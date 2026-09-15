import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { getIpSummaries } from "@/modules/access-log/service";

export async function GET() {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  const summaries = await getIpSummaries();
  return NextResponse.json(summaries);
}
