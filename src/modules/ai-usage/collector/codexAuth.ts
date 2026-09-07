import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

// OpenAI's public Codex CLI OAuth client id. Confirmed by observing the
// actual `codex` binary's own login output/behavior in this environment,
// not guessed — this is the same client every install of Codex CLI uses,
// there is no per-user secret associated with it (public/PKCE client).
export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";

// `@openai/codex` is a real project dependency (see package.json) so its
// binary is always at node_modules/.bin/codex relative to the process cwd
// — true both for `next dev`/`next start` (cwd = project root) and the
// standalone runner (full node_modules is copied in — see Dockerfile).
// CODEX_CLI_PATH overrides this for any other layout.
const CODEX_CLI_PATH = process.env.CODEX_CLI_PATH ?? join(process.cwd(), "node_modules", ".bin", "codex");
// Matches the device-auth flow's own stated expiry ("expires in 15 minutes")
// observed directly in the CLI's output.
const DEVICE_CODE_TIMEOUT_MS = 15 * 60 * 1000;

interface PendingLogin {
  child: ChildProcess;
  verificationUri: string;
  userCode: string;
  stdout: string;
  stderr: string;
  settled: boolean;
  result: Promise<{ ok: true } | { ok: false; error: string }>;
  timeout: ReturnType<typeof setTimeout>;
}

// Single-user app, at most one login attempt in flight at a time — a
// module-level variable is sufficient, no need for cross-request storage.
let pending: PendingLogin | null = null;

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Starts `codex login --device-auth` and waits just long enough for it to
 * print the verification URL + one-time code (typically ~1s), then returns
 * those to the caller while the process keeps running in the background
 * polling OpenAI's token endpoint until the user finishes in their own
 * browser (or the code expires).
 */
export async function startDeviceLogin(): Promise<
  { ok: true; verificationUri: string; userCode: string } | { ok: false; error: string }
> {
  if (pending && !pending.settled) {
    return { ok: true, verificationUri: pending.verificationUri, userCode: pending.userCode };
  }

  // CODEX_CLI_PATH is an external binary path (not a project module) — the
  // ignore comment stops Turbopack from tracing/bundling the whole project
  // just because this argument is dynamic (env-derived).
  const child = spawn(/* turbopackIgnore: true */ CODEX_CLI_PATH, ["login", "--device-auth"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const entry: PendingLogin = {
    child,
    verificationUri: "",
    userCode: "",
    stdout: "",
    stderr: "",
    settled: false,
    result: null as unknown as Promise<{ ok: true } | { ok: false; error: string }>,
    timeout: null as unknown as ReturnType<typeof setTimeout>,
  };

  entry.result = new Promise((resolve) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      entry.stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      entry.stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      entry.settled = true;
      clearTimeout(entry.timeout);
      resolve(code === 0 ? { ok: true } : { ok: false, error: stripAnsi(entry.stderr).trim().slice(-500) });
    });
    child.on("error", (err) => {
      entry.settled = true;
      clearTimeout(entry.timeout);
      resolve({ ok: false, error: err.message });
    });
  });

  entry.timeout = setTimeout(() => {
    if (!entry.settled) child.kill();
  }, DEVICE_CODE_TIMEOUT_MS);

  pending = entry;

  // Give the CLI a moment to print the URL + code, then parse stdout.
  // 5 retries * 400ms is generous relative to the ~1s observed in testing.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((r) => setTimeout(r, 400));
    const clean = stripAnsi(entry.stdout);
    const urlMatch = clean.match(/https:\/\/auth\.openai\.com\/codex\/device\S*/);
    const codeMatch = clean.match(/\b([A-Z0-9]{4,6}-[A-Z0-9]{4,6})\b/);
    if (urlMatch && codeMatch) {
      entry.verificationUri = urlMatch[0];
      entry.userCode = codeMatch[1];
      return { ok: true, verificationUri: entry.verificationUri, userCode: entry.userCode };
    }
    if (entry.settled) break;
  }

  if (entry.settled) {
    return { ok: false, error: stripAnsi(entry.stderr).trim().slice(-500) || "codex login exited before printing a device code" };
  }
  return { ok: false, error: "Timed out waiting for codex to print the device code" };
}

export type PollResult =
  | { status: "idle" }
  | { status: "pending"; verificationUri: string; userCode: string }
  | { status: "success" }
  | { status: "failed"; error: string };

/** Non-blocking check of the in-flight login started by startDeviceLogin(). */
export async function pollDeviceLogin(): Promise<PollResult> {
  if (!pending) return { status: "idle" };
  if (!pending.settled) {
    return { status: "pending", verificationUri: pending.verificationUri, userCode: pending.userCode };
  }
  const result = await pending.result;
  pending = null;
  return result.ok ? { status: "success" } : { status: "failed", error: result.error };
}

export function cancelDeviceLogin(): void {
  if (pending && !pending.settled) {
    pending.child.kill();
  }
  pending = null;
}
