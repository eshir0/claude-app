import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { pollDeviceLogin } from "@/modules/ai-usage/collector/codexAuth";
import { getConnectionStatus, recordCollectionResult } from "@/modules/ai-usage/collector/connectionService";
import { importCliCredentials } from "@/modules/ai-usage/collector/codexCredentials";

export async function GET() {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  const result = await pollDeviceLogin();

  if (result.status === "success") {
    const imported = await importCliCredentials();
    if (!imported.ok) {
      await recordCollectionResult({ ok: false, error: imported.error });
      return NextResponse.json({ status: "failed", error: imported.error });
    }
    const status = await getConnectionStatus();
    return NextResponse.json({ status: "connected", connection: status });
  }

  if (result.status === "idle") {
    const status = await getConnectionStatus();
    return NextResponse.json({ status: status.connected ? "connected" : "idle", connection: status });
  }

  return NextResponse.json(result);
}
