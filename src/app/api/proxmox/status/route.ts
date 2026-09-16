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
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[proxmox] status request failed:", raw);
    // A raw Node/OpenSSL error string (a mid-request pveproxy restart, a
    // dropped connection, a timeout) is real but not something a user
    // should have to parse — show a plain-language message for those and
    // reserve the verbatim message for genuinely actionable errors (e.g.
    // the fingerprint-mismatch security check in client.ts, which must stay
    // visible exactly as written).
    const transient = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPROTO|EHOSTUNREACH|ENETUNREACH|socket disconnected/i.test(
      raw,
    );
    const message = transient
      ? "Proxmox 서버에 일시적으로 연결할 수 없습니다 (네트워크 문제이거나 서비스가 재시작 중일 수 있습니다). 잠시 후 다시 시도해 주세요."
      : raw;
    return jsonError(502, "PROXMOX_REQUEST_FAILED", message);
  }
}
