import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { listEntriesQuerySchema } from "@/modules/ai-usage/logic";
import { listUsageEntries } from "@/modules/ai-usage/service";

// No POST here — entries are only ever created by the OpenAI/Codex
// collector (source: "AUTO"), never by a manually-typed value. See
// src/app/api/ai-usage/connections/collect/route.ts.
export async function GET(req: Request) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  const url = new URL(req.url);
  const parsed = listEntriesQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_ERROR", "Invalid query parameters", parsed.error.flatten());
  }

  const result = await listUsageEntries(parsed.data);
  return NextResponse.json(result);
}
