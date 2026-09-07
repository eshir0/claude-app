import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { isProxmoxConfigured } from "@/modules/proxmox/client";
import { getProxmoxOverview } from "@/modules/proxmox/service";

export async function GET() {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  if (!isProxmoxConfigured()) {
    return jsonError(400, "NOT_CONFIGURED", "Proxmox connection is not configured");
  }

  try {
    const overview = await getProxmoxOverview();
    return NextResponse.json(overview);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(502, "PROXMOX_REQUEST_FAILED", message);
  }
}
