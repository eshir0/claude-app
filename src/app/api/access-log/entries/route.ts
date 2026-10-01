import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { isTrustedOrigin } from "@/lib/auth/origin-check";
import { jsonError } from "@/lib/api-helpers";
import { getEntriesForIp, deleteIpHistory, deleteAllAccessLog } from "@/modules/access-log/service";

export async function GET(req: Request) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  const ip = new URL(req.url).searchParams.get("ip");
  if (!ip) return jsonError(400, "MISSING_IP", "ip query parameter is required");

  const entries = await getEntriesForIp(ip);
  return NextResponse.json(entries);
}

/**
 * `?ip=<ip>` deletes one IP's history; `?all=true` wipes the whole access
 * log. Wiping everything must be asked for explicitly (never the result of
 * a missing ip) and must come from the app's own origin.
 */
export async function DELETE(req: Request) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  const params = new URL(req.url).searchParams;
  const ip = params.get("ip");
  const all = params.get("all") === "true";

  if (all) {
    if (ip) return jsonError(400, "INVALID_QUERY", "Use either ip or all=true, not both");
    if (!isTrustedOrigin(req)) return jsonError(403, "ORIGIN_NOT_TRUSTED", "Request origin not allowed");
    await deleteAllAccessLog();
    return new NextResponse(null, { status: 204 });
  }

  if (!ip) return jsonError(400, "MISSING_IP", "ip query parameter is required");

  await deleteIpHistory(ip);
  return new NextResponse(null, { status: 204 });
}
