import { requireSessionPage } from "@/lib/auth/guard";
import { isProxmoxConfigured } from "../client";
import { getProxmoxOverview } from "../service";
import ServerView from "./ServerView";
import type { ProxmoxOverview } from "../types";

/**
 * Server Component: owns auth + the initial live fetch, same shape as
 * ai-usage's CardsWidget/CardsView split. A Proxmox outage or missing
 * config must not 500 the whole dashboard — both are caught and handed to
 * ServerView as state to render, not thrown.
 */
export default async function ServerWidget() {
  await requireSessionPage();

  if (!isProxmoxConfigured()) {
    return <ServerView configured={false} initialOverview={null} initialError={null} />;
  }

  let initialOverview: ProxmoxOverview | null = null;
  let initialError: string | null = null;
  try {
    initialOverview = await getProxmoxOverview();
  } catch (err) {
    initialError = err instanceof Error ? err.message : String(err);
  }

  return <ServerView configured={true} initialOverview={initialOverview} initialError={initialError} />;
}
