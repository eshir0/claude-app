import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guard";
import { jsonError } from "@/lib/api-helpers";
import { isTrustedOrigin } from "@/lib/auth/origin-check";
import { getConnectionStatus, deleteConnection } from "@/modules/ai-usage/collector/connectionService";
import { startDeviceLogin, cancelDeviceLogin } from "@/modules/ai-usage/collector/codexAuth";

export async function GET() {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");

  const status = await getConnectionStatus();
  return NextResponse.json(status);
}

/** Starts the ChatGPT/Codex device-code login flow. Returns immediately
 * with a verification URL + one-time code for the client to display; the
 * actual login completes asynchronously once the user finishes it in their
 * own browser (poll via GET /api/ai-usage/connections/poll). */
export async function POST(req: Request) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");
  if (!isTrustedOrigin(req)) {
    return jsonError(403, "ORIGIN_NOT_TRUSTED", "Request origin not allowed");
  }

  const result = await startDeviceLogin();
  if (!result.ok) {
    return jsonError(502, "DEVICE_LOGIN_START_FAILED", result.error);
  }
  return NextResponse.json({ verificationUri: result.verificationUri, userCode: result.userCode });
}

export async function DELETE(req: Request) {
  const session = await requireSessionApi();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Login required");
  if (!isTrustedOrigin(req)) {
    return jsonError(403, "ORIGIN_NOT_TRUSTED", "Request origin not allowed");
  }

  cancelDeviceLogin();
  await deleteConnection();
  return new NextResponse(null, { status: 204 });
}
