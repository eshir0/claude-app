#!/usr/bin/env node
// Generates a bcrypt hash for AUTH_PASSWORD_HASH. Deliberately interactive
// (never a CLI argument) so the plaintext password never ends up in shell
// history or a process list. Nothing here is written to disk or logged.
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";

// A pipe or a redirected file has no TTY, so readline's prompt/answer flow
// silently never gets real input to resolve on — the previous version of
// this script hung forever in that case instead of failing. This must be
// checked before creating the readline interface at all.
if (!process.stdin.isTTY) {
  console.error(
    "This script needs an interactive terminal (a TTY) to read your password " +
      "without echoing it or leaving it in shell history/logs.\n" +
      "Run it directly in a terminal — not piped, redirected, or run non-interactively.",
  );
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const originalWrite = rl._writeToOutput.bind(rl);
let masking = false;
rl._writeToOutput = function writeToOutput(str) {
  originalWrite(masking ? str.replace(/[^\r\n]/g, "*") : str);
};

let cancelled = false;
// A process-level handler, not `rl.on("SIGINT", ...)`: readline only emits
// its own 'SIGINT' event under conditions that didn't reliably fire here
// (verified — the raw event handler used above did not run before the
// process was terminated by the default SIGINT disposition; empirically,
// the process-level handler below does). Registering any 'SIGINT' listener
// on `process` itself is what actually suppresses Node's default
// immediate-terminate behavior for Ctrl+C.
process.on("SIGINT", () => {
  cancelled = true;
  process.stdout.write("\nCancelled — nothing was written.\n");
  rl.close();
  process.exit(130); // 128 + SIGINT(2), the conventional exit code for Ctrl+C
});

function readHiddenLine(prompt) {
  return new Promise((resolve) => {
    masking = false;
    rl.question(prompt, (answer) => {
      process.stdout.write("\n");
      resolve(answer);
    });
    masking = true;
  });
}

const password = await readHiddenLine("New dashboard password: ");
if (cancelled) process.exit(130); // guards the (unlikely) race between SIGINT and question() resolving
const confirm = await readHiddenLine("Confirm password: ");
if (cancelled) process.exit(130);
rl.close();

if (!password || password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}
if (password !== confirm) {
  console.error("Passwords did not match.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

// The bcrypt hash's literal "$" characters get mangled by two DIFFERENT
// tools in two DIFFERENT ways — the fix for one is wrong for the other:
//
//   - Next.js's own .env loader (@next/env, used by `npm run dev` /
//     `next start` / this app's instrumentation.ts) expands "$VAR" as a
//     reference to another variable. A raw hash silently becomes "" unless
//     every "$" is escaped as "\$".
//   - Docker Compose's variable interpolation (used to resolve ${VAR} in
//     docker-compose.yml from a .env file next to it) treats an unquoted
//     or double-quoted value the same broken way, but a SINGLE-quoted
//     value is used completely literally — no escaping wanted or needed,
//     and backslashes here would become part of the literal value (wrong).
//
// These are almost never the same file in practice (local dev vs. a
// deployment host), but printing both up front means never having to
// re-derive which escaping applies to which tool.
const escapedForNextDotEnv = hash.replace(/\$/g, "\\$");

console.log("For local dev — paste into .env (used by `npm run dev` / `next start`):\n");
console.log(`AUTH_PASSWORD_HASH=${escapedForNextDotEnv}`);
console.log(
  "\nFor Docker Compose — paste into the .env next to docker-compose.yml (single-quoted, NOT escaped):\n",
);
console.log(`AUTH_PASSWORD_HASH='${hash}'`);
