import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { getEntriesForIp } from "@/modules/access-log/service";

export async function GET(req: Request) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  const ip = new URL(req.url).searchParams.get("ip");
  if (!ip) return jsonError(400, "MISSING_IP", "ip query parameter is required");

  const entries = await getEntriesForIp(ip);
  return NextResponse.json(entries);
}
