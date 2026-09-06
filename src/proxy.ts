import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { nextProxyCookies } from "iron-session";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, isAuthenticated, type SessionData } from "@/lib/auth/session";

/**
 * UX-layer gate only — NOT the security boundary. This redirects an
 * unauthenticated browser away from pages it can't use yet, and returns 401
 * JSON for API calls so client code gets something it can branch on instead
 * of an HTML redirect body. The actual authorization check is repeated,
 * independently, in every Route Handler and Server Component that reads
 * data (see src/lib/auth/guard.ts) — a bug or a future refactor here must
 * not be able to expose data on its own.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // getIronSession() here only verifies the cookie signature/expiry — it
  // does not touch Prisma or any other Node-only resource, so this stays
  // cheap even though proxy runs on every matched request.
  return checkSession(request, response);
}

async function checkSession(request: NextRequest, response: NextResponse) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // instrumentation.ts should have already stopped the server from ever
    // reaching this point; this is a last-resort fail-closed, not the
    // primary defense.
    return unauthorized(request);
  }

  const session = await getIronSession<SessionData>(nextProxyCookies(request, response), {
    cookieName: SESSION_COOKIE_NAME,
    password: secret,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });

  if (!isAuthenticated(session)) {
    return unauthorized(request);
  }
  return response;
}

function unauthorized(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Login required" } },
      { status: 401 },
    );
  }
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except: /login, /api/auth/login, static assets, favicon.
    "/((?!login$|api/auth/login$|_next/static|_next/image|favicon.ico).*)",
  ],
};
