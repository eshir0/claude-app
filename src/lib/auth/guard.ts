import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession, isAuthenticated, type SessionData } from "./session";
import type { IronSession } from "iron-session";

/**
 * For Server Components / layouts / pages. Redirects to /login if there is
 * no valid session — this is the security boundary, not proxy.ts (see
 * proxy.ts's own comment on why). `cache()` memoizes per request so
 * multiple components checking the session in one render only read/verify
 * the cookie once.
 */
export const requireSessionPage = cache(async (): Promise<IronSession<SessionData>> => {
  const session = await getSession(await cookies());
  if (!isAuthenticated(session)) {
    redirect("/login");
  }
  return session;
});

/**
 * For Route Handlers. Returns null on failure instead of redirecting —
 * callers return a 401 JSON response, never an HTML redirect, so a fetch()
 * from client code gets a response it can actually branch on.
 */
export async function requireSessionApi(): Promise<IronSession<SessionData> | null> {
  const session = await getSession(await cookies());
  if (!isAuthenticated(session)) return null;
  return session;
}
