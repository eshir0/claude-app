import "server-only";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { saveTokens, type TokenSet } from "./connectionService.ts";

// $CODEX_HOME (default ~/.codex) is where the official codex CLI writes
// auth.json after a successful login — same convention codex-rs uses for
// its own config/session storage. Not officially documented as a stable
// public file format; confirmed via the CLI's own behavior plus multiple
// independent community write-ups (see project memory), not guessed.
function authJsonPath(): string {
  const home = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  return join(home, "auth.json");
}

interface CodexAuthFile {
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
  };
}

/** Best-effort decode of a JWT's `exp` claim, in epoch ms. Returns null if
 * the token isn't a 3-part JWT or has no exp claim — never throws, since
 * this is only used to pick a refresh time, not to validate the token. */
function tryDecodeJwtExpiryMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Reads the credentials the official codex CLI just wrote after a
 * successful `codex login --device-auth`, imports them into this app's own
 * encrypted storage, and removes the on-disk copy so there is exactly one
 * place (the encrypted DB row) holding the live token going forward.
 */
export async function importCliCredentials(): Promise<{ ok: true } | { ok: false; error: string }> {
  const path = authJsonPath();
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not read ${path}: ${message}` };
  }

  let parsed: CodexAuthFile;
  try {
    parsed = JSON.parse(raw) as CodexAuthFile;
  } catch {
    return { ok: false, error: `${path} did not contain valid JSON` };
  }

  const accessToken = parsed.tokens?.access_token;
  const refreshToken = parsed.tokens?.refresh_token;
  if (!accessToken || !refreshToken) {
    return { ok: false, error: `${path} is missing tokens.access_token or tokens.refresh_token` };
  }

  // If the access token's own exp claim can't be read, treat it as already
  // due for refresh — getValidAccessToken() will then refresh it on first
  // use, which also serves as an immediate end-to-end check that refresh
  // works, rather than silently trusting an unverified assumed TTL.
  const expiresAt = tryDecodeJwtExpiryMs(accessToken) ?? 0;

  const tokens: TokenSet = { accessToken, refreshToken, expiresAt };
  await saveTokens(tokens);

  try {
    await unlink(path);
  } catch {
    // Not fatal — the DB copy is now the source of truth either way.
  }

  return { ok: true };
}
