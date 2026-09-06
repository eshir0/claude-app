import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { createEntrySchema, listEntriesQuerySchema } from "@/modules/ai-usage/logic";
import { createUsageEntry, listUsageEntries } from "@/modules/ai-usage/service";

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

export async function POST(req: Request) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  // createEntrySchema has no `source` field, so a client-supplied
  // "source":"AUTO" is stripped during parsing — this route always creates
  // MANUAL entries no matter what the request body contains.
  const parsed = createEntrySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_ERROR", "Invalid entry", parsed.error.flatten());
  }

  const entry = await createUsageEntry(parsed.data);
  return NextResponse.json(entry, { status: 201 });
}
