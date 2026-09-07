import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { CODEX_OAUTH_CLIENT_ID, CODEX_OAUTH_TOKEN_URL } from "./codexAuth.ts";
import { shouldRefresh } from "./logic.ts";

/** OpenAI OAuth token set, as obtained from Codex CLI's device-auth login
 * (see codexAuth.ts) and refreshed directly against the token endpoint
 * thereafter. Field names match the OAuth token response, not guessed. */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when accessToken expires. */
  expiresAt: number;
}

export interface ConnectionStatusDTO {
  connected: boolean;
  status: "CONNECTED" | "ERROR" | null;
  lastError: string | null;
  lastCheckedAt: string | null;
}

const PROVIDER = "OPENAI" as const;

export async function saveTokens(tokens: TokenSet): Promise<void> {
  const encryptedState = encryptSecret(JSON.stringify(tokens));
  await prisma.serviceConnection.upsert({
    where: { provider: PROVIDER },
    create: { provider: PROVIDER, encryptedState, status: "CONNECTED" },
    update: { encryptedState, status: "CONNECTED", lastError: null },
  });
}

export async function loadTokens(): Promise<TokenSet | null> {
  const row = await prisma.serviceConnection.findUnique({ where: { provider: PROVIDER } });
  if (!row) return null;
  return JSON.parse(decryptSecret(row.encryptedState)) as TokenSet;
}

export async function deleteConnection(): Promise<void> {
  await prisma.serviceConnection.deleteMany({ where: { provider: PROVIDER } });
}

export async function recordCollectionResult(
  result: { ok: true } | { ok: false; error: string },
): Promise<void> {
  await prisma.serviceConnection.updateMany({
    where: { provider: PROVIDER },
    data: result.ok
      ? { status: "CONNECTED", lastError: null, lastCheckedAt: new Date() }
      : { status: "ERROR", lastError: result.error.slice(0, 500), lastCheckedAt: new Date() },
  });
}

export async function getConnectionStatus(): Promise<ConnectionStatusDTO> {
  const row = await prisma.serviceConnection.findUnique({ where: { provider: PROVIDER } });
  return {
    connected: Boolean(row),
    status: row?.status ?? null,
    lastError: row?.lastError ?? null,
    lastCheckedAt: row?.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
  };
}

interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/** Refreshes the stored access token via OpenAI's OAuth token endpoint,
 * using the same public client id Codex CLI itself uses for refresh — a
 * standard OAuth refresh_token grant, no PKCE verifier needed for this leg. */
async function refreshTokens(current: TokenSet): Promise<TokenSet> {
  const res = await fetch(CODEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CODEX_OAUTH_CLIENT_ID,
      refresh_token: current.refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as RefreshResponse;
  const next: TokenSet = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? current.refreshToken,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  await saveTokens(next);
  return next;
}

/** Returns a token set guaranteed valid for a safety margin, refreshing
 * against the token endpoint first if the stored one is stale. */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;
  if (!shouldRefresh(tokens.expiresAt, Date.now())) return tokens.accessToken;
  const refreshed = await refreshTokens(tokens);
  return refreshed.accessToken;
}
