import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { isProxmoxConfigured, isTransientNetworkError } from "@/modules/proxmox/client";
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
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[proxmox] status request failed (after retries):", raw);
    // client.ts's proxmoxRequest already retries a transient failure a
    // couple of times on its own — reaching here means either a non-
    // transient error, or a transient one that didn't clear up within
    // those retries. Either way, a raw Node/OpenSSL error string isn't
    // something a user should have to parse; reserve the verbatim message
    // for genuinely actionable errors (e.g. the fingerprint-mismatch
    // security check in client.ts, which must stay visible exactly as
    // written).
    const message = isTransientNetworkError(err)
      ? "Proxmox 서버에 일시적으로 연결할 수 없습니다 (네트워크 문제이거나 서비스가 재시작 중일 수 있습니다). 잠시 후 다시 시도해 주세요."
      : raw;
    return jsonError(502, "PROXMOX_REQUEST_FAILED", message);
  }
}
