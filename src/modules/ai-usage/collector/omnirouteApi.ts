import "server-only";

// Reads Claude Pro usage from a self-hosted OmniRoute instance's management
// API (GET /api/usage/{connectionId}) — OmniRoute already holds an OAuth
// connection to the user's own Claude account and resolves the real
// session/weekly quota; this app never touches that Anthropic credential
// itself, only OmniRoute's own separately-issued management API key. See
// project memory for why this app does NOT do its own Anthropic OAuth/
// scraping for Claude — this path is a conscious, informed exception the
// user chose after being told the tradeoffs.
const DEFAULT_BASE_URL = "http://localhost:20128";

export function isOmnirouteClaudeConfigured(): boolean {
  return Boolean(process.env.OMNIROUTE_API_KEY && process.env.OMNIROUTE_CLAUDE_CONNECTION_ID);
}

export interface OmnirouteFetchResult {
  ok: boolean;
  status: number;
  /** Raw parsed JSON body — mapped separately in logic.ts. */
  body: unknown;
}

export async function fetchOmnirouteClaudeUsage(): Promise<OmnirouteFetchResult> {
  const baseUrl = process.env.OMNIROUTE_BASE_URL || DEFAULT_BASE_URL;
  const apiKey = process.env.OMNIROUTE_API_KEY;
  const connectionId = process.env.OMNIROUTE_CLAUDE_CONNECTION_ID;
  if (!apiKey || !connectionId) {
    throw new Error("OmniRoute is not configured (OMNIROUTE_API_KEY / OMNIROUTE_CLAUDE_CONNECTION_ID)");
  }

  const res = await fetch(`${baseUrl}/api/usage/${connectionId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }

  return { ok: res.ok, status: res.status, body };
}
