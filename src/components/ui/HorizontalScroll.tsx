"use client";

import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import clsx from "clsx";

// Movement (px) before a press counts as a drag rather than a click, so a
// slightly shaky click on a row still expands it.
const DRAG_THRESHOLD_PX = 5;

/**
 * An `overflow-x-auto` box for wide tables that can be dragged sideways
 * with the mouse: press anywhere in it and move left/right. A press that
 * turns into a drag never also counts as a click (so dragging across a row
 * doesn't expand it). Buttons, links and form fields keep their normal
 * behaviour. Touch and trackpads already scroll natively and are left
 * alone, as are the mouse wheel and the scrollbar.
 */
export function HorizontalScroll({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Box width (window resize, sidebar toggle) and content width (rows
    // loading or expanding) both change whether there's anything to drag.
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    let pointerId: number | null = null;
    let startX = 0;
    let startScrollLeft = 0;
    let dragged = false;

    function endDrag() {
      el!.classList.remove("cursor-grabbing", "select-none");
    }

    function onPointerDown(e: PointerEvent) {
      dragged = false;
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if (el!.scrollWidth <= el!.clientWidth) return;
      if ((e.target as Element).closest("button, a, input, textarea, select, [contenteditable]")) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startScrollLeft = el!.scrollLeft;
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      if (!dragged) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        dragged = true;
        el!.setPointerCapture(e.pointerId);
        el!.classList.add("cursor-grabbing", "select-none");
        window.getSelection()?.removeAllRanges();
      }
      e.preventDefault();
      el!.scrollLeft = startScrollLeft - dx;
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (el!.hasPointerCapture(e.pointerId)) el!.releasePointerCapture(e.pointerId);
      endDrag();
    }

    // Capture phase on the box runs before React's own click handling (which
    // listens at the root during bubbling), so stopping it here keeps a
    // drag's closing click from reaching row onClick handlers.
    function onClickCapture(e: MouseEvent) {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      observer.disconnect();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  return (
    <div ref={ref} className={clsx("overflow-x-auto", overflowing && "cursor-grab", className)} {...props}>
      {children}
    </div>
  );
}

export default HorizontalScroll;
