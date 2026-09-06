import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { isTrustedOrigin } from "@/lib/auth/origin-check";
import { jsonError } from "@/lib/api-helpers";

// POST only — logout must never be triggerable by a plain GET navigation
// (e.g. a prefetch or a link a crawler follows).
export async function POST(req: Request) {
  if (!isTrustedOrigin(req)) {
    return jsonError(403, "ORIGIN_NOT_TRUSTED", "Request origin not allowed");
  }
  const session = await getSession(await cookies());
  session.destroy();
  return NextResponse.json({ ok: true });
}
