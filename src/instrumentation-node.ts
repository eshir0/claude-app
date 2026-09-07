// Node-only half of instrumentation.ts's register() hook — see that file's
// comment for why this is a separate module rather than an inline branch.
import { collectAndSaveCodexUsage } from "@/modules/ai-usage/collector/collectService";

const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function validateRequiredEnv(): void {
  const problems: string[] = [];

  const hash = process.env.AUTH_PASSWORD_HASH;
  if (!hash) {
    problems.push("AUTH_PASSWORD_HASH is not set.");
  } else if (!BCRYPT_HASH_RE.test(hash)) {
    problems.push(
      "AUTH_PASSWORD_HASH does not look like a bcrypt hash. Generate one with: node scripts/hash-password.mjs",
    );
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    problems.push("SESSION_SECRET is not set.");
  } else if (secret.length < 32) {
    problems.push("SESSION_SECRET must be at least 32 characters.");
  }

  if (!process.env.APP_ORIGIN) {
    problems.push(
      "APP_ORIGIN is not set (needed to validate the Origin header on login/logout/write requests).",
    );
  }

  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL is not set.");
  }

  // Only needed for the optional automated-collector feature (saved
  // provider sessions), but validated unconditionally so a misconfigured
  // key is caught at boot rather than the first time someone tries to
  // connect a provider.
  const credKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!credKey) {
    problems.push("CREDENTIAL_ENCRYPTION_KEY is not set.");
  } else if (Buffer.from(credKey, "base64").length !== 32) {
    problems.push("CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded).");
  }

  if (problems.length > 0) {
    console.error(
      "\nRefusing to start: invalid or missing required configuration.\n" +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\nSee .env.example.\n",
    );
    // Throwing here is not guaranteed across every Next.js deploy target to
    // stop the process, so we also exit explicitly — this must never leave
    // the server listening in an insecure default state.
    process.exit(1);
  }
}

// User-requested cadence ("30분~1시간 간격"): 30 minutes, the more frequent
// end of that range. Conservative compared to what the official Codex CLI
// itself does against this same endpoint (~60s polling, per its own
// backend-client source) — this app doesn't need that freshness, since the
// underlying limits only move over 5h/7d windows.
const BACKGROUND_COLLECT_INTERVAL_MS = 30 * 60 * 1000;

let backgroundCollectorStarted = false;

/**
 * Runs the same collect-and-save logic as the manual "지금 수집" button, on
 * a fixed interval, for as long as this server process lives — this is what
 * makes the home page's numbers move without anyone opening the app. A
 * no-op (not an error) whenever no OpenAI connection is saved yet.
 */
export function startBackgroundCollector(): void {
  if (backgroundCollectorStarted) return;
  backgroundCollectorStarted = true;

  async function tick() {
    try {
      const result = await collectAndSaveCodexUsage();
      if (!result.ok && result.reason !== "NOT_CONNECTED") {
        console.error("[ai-usage] background collection did not succeed:", result);
      }
    } catch (err) {
      console.error("[ai-usage] background collection threw:", err);
    }
  }

  // A short initial delay (not immediate) lets the server finish starting
  // up first; the interval then repeats for the life of the process.
  setTimeout(tick, 5_000);
  setInterval(tick, BACKGROUND_COLLECT_INTERVAL_MS);
}
