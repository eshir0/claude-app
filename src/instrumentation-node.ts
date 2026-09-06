// Node-only half of instrumentation.ts's register() hook — see that file's
// comment for why this is a separate module rather than an inline branch.
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
