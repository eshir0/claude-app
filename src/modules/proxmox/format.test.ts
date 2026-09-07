import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatBytes, formatPercent, formatUptime, usageLevelClass, tempLevelClass } from "./format.ts";

describe("formatBytes", () => {
  test("shows MB below 1 GB", () => {
    assert.equal(formatBytes(500 * 1024 ** 2), "500 MB");
  });
  test("shows GB with one decimal from 1 GB up to (not including) 1000 GB", () => {
    assert.equal(formatBytes(1.5 * 1024 ** 3), "1.5 GB");
    assert.equal(formatBytes(999 * 1024 ** 3), "999.0 GB");
  });
  test("switches to TB at/above 1000 GB", () => {
    assert.equal(formatBytes(1000 * 1024 ** 3), "1.0 TB");
    assert.equal(formatBytes(1710 * 1024 ** 3), "1.7 TB");
  });
  test("treats zero/negative as 0 GB", () => {
    assert.equal(formatBytes(0), "0 GB");
    assert.equal(formatBytes(-5), "0 GB");
  });
});

describe("formatPercent", () => {
  test("rounds a 0-1 fraction to a whole percent", () => {
    assert.equal(formatPercent(0.361), "36%");
    assert.equal(formatPercent(0), "0%");
    assert.equal(formatPercent(1), "100%");
  });
});

describe("usageLevelClass", () => {
  test("no color below 75%", () => {
    assert.equal(usageLevelClass(0.74), "");
  });
  test("amber from 75% up to (not including) 90%", () => {
    assert.equal(usageLevelClass(0.75), "text-amber-600 dark:text-amber-400");
    assert.equal(usageLevelClass(0.89), "text-amber-600 dark:text-amber-400");
  });
  test("red at/above 90%", () => {
    assert.equal(usageLevelClass(0.9), "text-red-600 dark:text-red-400");
    assert.equal(usageLevelClass(1), "text-red-600 dark:text-red-400");
  });
});

describe("tempLevelClass", () => {
  test("no color below 80°C", () => {
    assert.equal(tempLevelClass(79), "");
  });
  test("amber from 80°C up to (not including) 90°C", () => {
    assert.equal(tempLevelClass(80), "text-amber-600 dark:text-amber-400");
    assert.equal(tempLevelClass(89), "text-amber-600 dark:text-amber-400");
  });
  test("red at/above 90°C", () => {
    assert.equal(tempLevelClass(90), "text-red-600 dark:text-red-400");
    assert.equal(tempLevelClass(100), "text-red-600 dark:text-red-400");
  });
});

describe("formatUptime", () => {
  test("seconds only under a minute", () => {
    assert.equal(formatUptime(45), "45초");
  });
  test("minutes under an hour", () => {
    assert.equal(formatUptime(125), "2분");
  });
  test("hours and minutes under a day", () => {
    assert.equal(formatUptime(3 * 3600 + 5 * 60), "3시간 5분");
  });
  test("days and hours at/above a day", () => {
    assert.equal(formatUptime(2 * 86400 + 4 * 3600), "2일 4시간");
  });
});
