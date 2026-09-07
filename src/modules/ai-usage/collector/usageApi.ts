import "server-only";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

export interface UsageFetchResult {
  ok: boolean;
  status: number;
  /** Raw parsed JSON body — not yet mapped to USAGE_METRICS. The real shape
   * of this response has not been observed yet (see project memory); until
   * it has, this app deliberately shows the raw payload instead of
   * guessing a percent/reset-time mapping and presenting it as fact. */
  body: unknown;
}

export async function fetchCodexUsage(accessToken: string): Promise<UsageFetchResult> {
  const res = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
