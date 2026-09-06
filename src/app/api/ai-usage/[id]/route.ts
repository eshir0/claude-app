import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { isTrustedOrigin } from "@/lib/auth/origin-check";
import { deleteUsageEntry } from "@/modules/ai-usage/service";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");
  if (!isTrustedOrigin(req)) {
    return jsonError(403, "ORIGIN_NOT_TRUSTED", "Request origin not allowed");
  }

  const { id } = await params;
  await deleteUsageEntry(id);
  return new NextResponse(null, { status: 204 });
}
