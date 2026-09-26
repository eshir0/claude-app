"use client";

import { useEffect, useRef, type HTMLAttributes } from "react";
import clsx from "clsx";
import { horizontalWheelDelta } from "@/lib/horizontal-wheel";

/**
 * An `overflow-x-auto` box (wide tables) that also scrolls sideways with a
 * plain mouse wheel: down → right, up → left. At either end the wheel is
 * handed back to the page, so it never traps vertical scrolling.
 */
export function HorizontalScroll({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Native listener, not React's onWheel: React attaches wheel handlers
    // as passive, so preventDefault() there can't stop the page scrolling.
    function onWheel(e: WheelEvent) {
      const dx = horizontalWheelDelta(e, el!);
      if (dx === null) return;
      e.preventDefault();
      el!.scrollLeft += dx;
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return <div ref={ref} className={clsx("overflow-x-auto", className)} {...props} />;
}

export default HorizontalScroll;
