// Node-only half of instrumentation.ts's register() hook — see that file's
// comment for why this is a separate module rather than an inline branch.
import {
  collectAndSaveCodexUsage,
  collectAndSaveClaudeUsageFromOmniroute,
} from "@/modules/ai-usage/collector/collectService";
import { checkAndUpdateLotto } from "@/modules/lotto/collector/collectService";

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
        console.error("[ai-usage] Codex background collection did not succeed:", result);
      }
    } catch (err) {
      console.error("[ai-usage] Codex background collection threw:", err);
    }

    try {
      const result = await collectAndSaveClaudeUsageFromOmniroute();
      if (!result.ok && result.reason !== "NOT_CONNECTED") {
        console.error("[ai-usage] Claude (OmniRoute) background collection did not succeed:", result);
      }
    } catch (err) {
      console.error("[ai-usage] Claude (OmniRoute) background collection threw:", err);
    }
  }

  // A short initial delay (not immediate) lets the server finish starting
  // up first; the interval then repeats for the life of the process.
  setTimeout(tick, 5_000);
  setInterval(tick, BACKGROUND_COLLECT_INTERVAL_MS);
}

// User preference: land on Monday morning rather than as soon as Saturday's
// draw result appears — a deliberate weekly cadence, not a technical
// constraint of the scraper (which is idempotent and cheap to run anytime).
// Korea has no DST, so 09:00 KST is always exactly 00:00 UTC — no timezone
// library needed.
const LOTTO_WEEKLY_CHECK_UTC_DAY = 1; // Monday
const LOTTO_WEEKLY_CHECK_UTC_HOUR = 0; // 00:00 UTC == 09:00 KST

function msUntilNextLottoCheck(from: Date): number {
  const target = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), LOTTO_WEEKLY_CHECK_UTC_HOUR, 0, 0, 0),
  );
  const daysUntilTarget = (LOTTO_WEEKLY_CHECK_UTC_DAY - from.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysUntilTarget);
  if (target.getTime() <= from.getTime()) {
    target.setUTCDate(target.getUTCDate() + 7);
  }
  return target.getTime() - from.getTime();
}

let lottoSchedulerStarted = false;

/**
 * Same shape as startBackgroundCollector() above: idempotent-start guard,
 * errors logged and swallowed (never thrown uncaught). A no-op (not an
 * error) once the DB is fully backfilled and up to date — this is what
 * makes the home page's lotto widget update itself without anyone opening
 * the app or clicking anything.
 *
 * Two triggers, not one: an immediate boot-time check (unconditional catch-up
 * for a fresh/empty DB or a restart that missed last Monday's window
 * entirely), plus a recurring check re-scheduled from real wall-clock time
 * after each run — rather than setInterval — so a long-lived process can't
 * drift off Monday 09:00 KST over many weeks.
 */
export function startLottoScheduler(): void {
  if (lottoSchedulerStarted) return;
  lottoSchedulerStarted = true;

  async function tick() {
    try {
      const result = await checkAndUpdateLotto();
      if (!result.ok) {
        console.error("[lotto] Scheduled check did not succeed:", result);
      }
    } catch (err) {
      console.error("[lotto] Scheduled check threw:", err);
    }
  }

  function scheduleNextWeeklyCheck() {
    setTimeout(async () => {
      await tick();
      scheduleNextWeeklyCheck();
    }, msUntilNextLottoCheck(new Date()));
  }

  // Offset from the ai-usage collector's 5s start so the two don't both
  // fire in the same tick on a fresh boot.
  setTimeout(tick, 15_000);
  scheduleNextWeeklyCheck();
}
