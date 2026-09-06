import "server-only";

/**
 * CSRF defense-in-depth for state-changing requests (login/logout/create/
 * delete). SameSite=Lax already stops the classic cross-site POST attack;
 * this is a second, independent check.
 *
 * A missing Origin header and the literal string "null" are both treated as
 * untrusted — some sandboxed/redirected browser contexts send "null" rather
 * than omitting the header, and "no header, so allow" is not a safe default.
 */
export function isTrustedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return false;
  const trusted = process.env.APP_ORIGIN;
  return Boolean(trusted) && origin === trusted;
}
