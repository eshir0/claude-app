import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import type { CookieJar, CookieStore } from "iron-session";

export interface SessionData {
  authenticated: true;
  loggedInAt: number;
}

export const SESSION_COOKIE_NAME = "claude-app-session";

// `ttl` (seconds) is the single source of truth for session lifetime —
// iron-session derives the cookie's max-age from it automatically
// (max-age = ttl - 60s), so we never set cookieOptions.maxAge separately;
// doing so would let the two drift out of sync.
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // Deliberately not caught anywhere: a missing/short secret must stop the
    // app from serving requests, not fall back to a weaker default.
    throw new Error(
      "SESSION_SECRET is missing or shorter than 32 characters. Refusing to start.",
    );
  }
  return secret;
}

function sessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE_NAME,
    password: requireSecret(),
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession(
  cookies: CookieStore | CookieJar,
): Promise<import("iron-session").IronSession<SessionData>> {
  return getIronSession<SessionData>(cookies, sessionOptions());
}

export function isAuthenticated(session: Partial<SessionData>): boolean {
  return session.authenticated === true;
}
