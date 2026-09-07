// Integration tests against a REAL running server (not a mock, not an
// in-process import) — this is what actually exercises route protection,
// since guard.ts/service.ts are the things being protected and importing
// them directly would just test the mock, not the boundary.
//
// Requires a server already running (this file does not start one):
//   npm run build && npm run start:standalone   (or `npm run dev`)
//   BASE_URL=http://localhost:3000 npm run test:integration
//
// Needs a real AUTH_PASSWORD_HASH/SESSION_SECRET/APP_ORIGIN configured on
// that server, and TEST_PASSWORD set to the plaintext password matching
// that hash (never the hash itself — this only needs what a real login
// form would submit). Also needs DATABASE_URL set in THIS process's own
// env (matching the server's) — there is no public create endpoint any
// more (entries only ever come from the OpenAI/Codex collector), so this
// test seeds/cleans up AiUsageEntry rows via a direct Prisma connection to
// the same database instead of going through HTTP.
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TEST_PASSWORD = process.env.TEST_PASSWORD;

function testPrisma(): PrismaClient | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
}

function extractCookie(res: Response): string | null {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  return raw.split(";")[0];
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ password: TEST_PASSWORD }),
  });
  assert.equal(res.status, 200, "login with the configured test password must succeed");
  const cookie = extractCookie(res);
  assert.ok(cookie, "login must set a session cookie");
  return cookie!;
}

test("integration suite", {
  skip:
    (!TEST_PASSWORD && "set TEST_PASSWORD to run integration tests against a live server") ||
    (!process.env.DATABASE_URL && "set DATABASE_URL (matching the server's) to seed test data directly"),
}, async (t) => {
  await t.test("unauthenticated API access is rejected with 401 JSON, not an HTML redirect", async () => {
    const res = await fetch(`${BASE_URL}/api/ai-usage/cards`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, "UNAUTHENTICATED");
  });

  await t.test("unauthenticated page access redirects to /login", async () => {
    const res = await fetch(`${BASE_URL}/`, { redirect: "manual" });
    assert.equal(res.status, 307);
    assert.match(res.headers.get("location") ?? "", /\/login$/);
  });

  await t.test("a tampered session cookie is rejected, not treated as a valid session", async () => {
    const res = await fetch(`${BASE_URL}/api/ai-usage/cards`, {
      headers: { Cookie: "claude-app-session=Fe26.2*tampered" },
    });
    assert.equal(res.status, 401);
  });

  await t.test("login without a trusted Origin header is rejected", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // no Origin at all
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    assert.equal(res.status, 403);
  });

  await t.test("login with an Origin: null header is rejected", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "null" },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    assert.equal(res.status, 403);
  });

  await t.test("login with the wrong password is rejected", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({ password: "definitely-not-it" }),
    });
    assert.equal(res.status, 401);
  });

  await t.test("full authenticated flow: login, latest-record selection, delete", async () => {
    const prisma = testPrisma();
    assert.ok(prisma, "DATABASE_URL must be set for this test");

    const cookie = await login();

    // Authenticated home page now loads.
    const home = await fetch(`${BASE_URL}/`, { headers: { Cookie: cookie } });
    assert.equal(home.status, 200);

    // This test asserts on WHICH entry ends up "latest", so it needs a known
    // starting state — wipe any pre-existing chatgpt_codex_5h_window rows
    // first. Without this, leftover rows from a previous test run (or a
    // concurrent one, since this dev database is a shared local file) make
    // the "fallback lands on exactly this id" assertions flaky for reasons
    // that have nothing to do with the behavior under test.
    await prisma.aiUsageEntry.deleteMany({ where: { metricId: "chatgpt_codex_5h_window" } });

    // Seed directly via Prisma — there is no public create endpoint any
    // more (only the collector creates entries, always source: "AUTO").
    const latest = await prisma.aiUsageEntry.create({
      data: {
        metricId: "chatgpt_codex_5h_window",
        usagePercent: 77,
        recordedAt: new Date(),
        source: "AUTO",
      },
    });
    const backdated = await prisma.aiUsageEntry.create({
      data: {
        metricId: "chatgpt_codex_5h_window",
        usagePercent: 5,
        recordedAt: new Date("2020-06-01T00:00:00Z"),
        source: "AUTO",
      },
    });

    // The card must still reflect the true latest (by recordedAt), not the
    // most recently inserted row.
    const cardsRes = await fetch(`${BASE_URL}/api/ai-usage/cards`, { headers: { Cookie: cookie } });
    const cards = await cardsRes.json();
    assert.equal(cards.chatgpt_codex_5h_window.kind, "OK");
    assert.equal(cards.chatgpt_codex_5h_window.entry.id, latest.id);

    // Delete the latest; the card must fall back to the next-latest entry,
    // not disappear or reset to 0.
    const delRes = await fetch(`${BASE_URL}/api/ai-usage/${latest.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: BASE_URL },
    });
    assert.equal(delRes.status, 204);

    const cardsAfterDelete = await (
      await fetch(`${BASE_URL}/api/ai-usage/cards`, { headers: { Cookie: cookie } })
    ).json();
    assert.equal(cardsAfterDelete.chatgpt_codex_5h_window.entry.id, backdated.id);

    // Cross-origin DELETE is rejected even with a valid session cookie.
    const csrfDel = await fetch(`${BASE_URL}/api/ai-usage/${backdated.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: "https://evil.example.com" },
    });
    assert.equal(csrfDel.status, 403);

    // Clean up.
    await fetch(`${BASE_URL}/api/ai-usage/${backdated.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: BASE_URL },
    });

    // Logout instructs the BROWSER to drop the cookie (Set-Cookie Max-Age=0)
    // — that's what this asserts. This is a stateless (iron-session) design:
    // there is no server-side revocation list, so the raw token string
    // itself, if a test manually replays it (as opposed to a real browser,
    // which would have already discarded it), stays cryptographically valid
    // until its original expiry. That's a deliberate, documented tradeoff
    // (see README "Known limitations"), not something to paper over here.
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: BASE_URL },
    });
    assert.equal(logoutRes.status, 200);
    const clearedCookie = extractCookie(logoutRes);
    assert.equal(clearedCookie, "claude-app-session=", "logout must clear the cookie value");
    assert.match(logoutRes.headers.get("set-cookie") ?? "", /Max-Age=0/i);

    await prisma.$disconnect();
  });
});
