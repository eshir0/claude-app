import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { horizontalWheelDelta } from "./horizontal-wheel.ts";

const wheel = (deltaY: number, extra: Partial<{ deltaX: number; deltaMode: number; ctrlKey: boolean }> = {}) => ({
  deltaX: 0,
  deltaMode: 0,
  ctrlKey: false,
  deltaY,
  ...extra,
});
const box = (scrollLeft: number, scrollWidth = 1200, clientWidth = 800) => ({ scrollLeft, scrollWidth, clientWidth });

describe("horizontalWheelDelta", () => {
  test("wheel down scrolls right, wheel up scrolls left", () => {
    assert.equal(horizontalWheelDelta(wheel(100), box(200)), 100);
    assert.equal(horizontalWheelDelta(wheel(-100), box(200)), -100);
  });

  test("at the right edge, wheel down is left to the page", () => {
    assert.equal(horizontalWheelDelta(wheel(100), box(400)), null);
    assert.equal(horizontalWheelDelta(wheel(100), box(399.5)), null);
  });

  test("at the left edge, wheel up is left to the page", () => {
    assert.equal(horizontalWheelDelta(wheel(-100), box(0)), null);
  });

  test("a box that doesn't overflow is left alone", () => {
    assert.equal(horizontalWheelDelta(wheel(100), box(0, 800, 800)), null);
  });

  test("already-horizontal gestures and ctrl+wheel zoom are left alone", () => {
    assert.equal(horizontalWheelDelta(wheel(10, { deltaX: 40 }), box(200)), null);
    assert.equal(horizontalWheelDelta(wheel(100, { ctrlKey: true }), box(200)), null);
  });

  test("line and page delta modes are converted to pixels", () => {
    assert.equal(horizontalWheelDelta(wheel(3, { deltaMode: 1 }), box(0)), 48);
    assert.equal(horizontalWheelDelta(wheel(1, { deltaMode: 2 }), box(0)), 800);
  });
});
