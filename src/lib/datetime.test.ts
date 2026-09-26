import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatDateTime, formatDate } from "./datetime.ts";

// Run with a non-Korean TZ/locale (see test:unit / the regression run) to
// prove the output doesn't depend on the host environment — that
// dependence is exactly what caused the SSR/browser hydration mismatch.
describe("datetime formatting is host-independent", () => {
  test("formatDateTime renders in KST with Korean formatting", () => {
    assert.equal(formatDateTime("2026-09-26T03:43:45Z"), "2026. 9. 26. 오후 12:43:45");
  });

  test("formatDateTime crosses the date line correctly (UTC evening = next KST day)", () => {
    assert.equal(formatDateTime("2026-09-25T20:00:00Z"), "2026. 9. 26. 오전 5:00:00");
  });

  test("formatDate renders the KST calendar date", () => {
    assert.equal(formatDate("2026-09-25T20:00:00Z"), "2026. 9. 26.");
  });

  test("accepts epoch millis and Date objects the same as ISO strings", () => {
    const iso = "2026-09-26T03:43:45Z";
    assert.equal(formatDateTime(Date.parse(iso)), formatDateTime(iso));
    assert.equal(formatDateTime(new Date(iso)), formatDateTime(iso));
  });
});
