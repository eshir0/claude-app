import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { isTrustedOrigin } from "@/lib/auth/origin-check";
import { collectAndSaveClaudeUsageFromOmniroute } from "@/modules/ai-usage/collector/collectService";

export async function POST(req: Request) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");
  if (!isTrustedOrigin(req)) {
    return jsonError(403, "ORIGIN_NOT_TRUSTED", "Request origin not allowed");
  }

  const result = await collectAndSaveClaudeUsageFromOmniroute();

  if (!result.ok) {
    if (result.reason === "NOT_CONNECTED") {
      return jsonError(400, "NOT_CONNECTED", "OmniRoute is not configured (see .env.example)");
    }
    if (result.reason === "FETCH_FAILED") {
      return NextResponse.json(
        { ok: false, status: result.status, body: result.body, savedEntries: [] },
      );
    }
    return jsonError(502, "COLLECT_FAILED", result.message);
  }

  return NextResponse.json(result);
}
