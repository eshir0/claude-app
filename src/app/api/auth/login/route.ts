import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { isTrustedOrigin } from "@/lib/auth/origin-check";
import {
  getRateLimitKey,
  isLockedOut,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/rate-limit";
import { jsonError } from "@/lib/api-helpers";

export async function POST(req: Request) {
  if (!isTrustedOrigin(req)) {
    return jsonError(403, "ORIGIN_NOT_TRUSTED", "Request origin not allowed");
  }

  const rateLimitKey = getRateLimitKey(req);
  if (isLockedOut(rateLimitKey)) {
    return jsonError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many failed login attempts. Try again in a minute.",
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const password =
    typeof body === "object" && body !== null && "password" in body && typeof (body as Record<string, unknown>).password === "string"
      ? (body as Record<string, string>).password
      : "";
  if (!password) {
    return jsonError(400, "VALIDATION_ERROR", "password is required");
  }

  const valid = await verifyPassword(password);
  if (!valid) {
    recordLoginFailure(rateLimitKey);
    return jsonError(401, "INVALID_CREDENTIALS", "Incorrect password");
  }

  recordLoginSuccess(rateLimitKey);

  // A fresh session object every time (new loggedInAt, re-sealed cookie) —
  // login always issues a new session rather than extending whatever cookie
  // happened to be present (session-fixation defense).
  const session = await getSession(await cookies());
  session.authenticated = true;
  session.loggedInAt = Date.now();
  await session.save();

  return NextResponse.json({ ok: true });
}
