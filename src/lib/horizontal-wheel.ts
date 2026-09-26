// Pure logic behind HorizontalScroll (kept React/DOM-free so it's unit
// testable): turn a vertical mouse-wheel step into a horizontal scroll of
// a wide table — wheel down → right, wheel up → left.

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  /** WheelEvent.deltaMode: 0 = pixels, 1 = lines, 2 = pages. */
  deltaMode: number;
  ctrlKey: boolean;
}

export interface ScrollBox {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

const LINE_PX = 16;

/**
 * The pixels to add to scrollLeft, or null to leave the event alone (the
 * page scrolls vertically as usual). Left alone when:
 * - ctrl+wheel (browser zoom / trackpad pinch);
 * - the gesture is already mostly horizontal (trackpad swipe, shift+wheel)
 *   — the browser scrolls the box natively;
 * - the box doesn't overflow at all;
 * - the box is already at the edge it's being pushed toward — so the wheel
 *   never gets stuck on a table: once it reaches the end, the page keeps
 *   scrolling.
 */
export function horizontalWheelDelta(e: WheelInput, box: ScrollBox): number | null {
  if (e.ctrlKey) return null;
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return null;

  const max = box.scrollWidth - box.clientWidth;
  if (max <= 0) return null;

  const dy = e.deltaMode === 1 ? e.deltaY * LINE_PX : e.deltaMode === 2 ? e.deltaY * box.clientWidth : e.deltaY;
  // 1px slack: scrollLeft can be fractional on zoomed/HiDPI screens and
  // stop just short of max.
  if (dy < 0 && box.scrollLeft <= 0) return null;
  if (dy > 0 && box.scrollLeft >= max - 1) return null;
  return dy;
}
