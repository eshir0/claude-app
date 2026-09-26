import type { HTMLAttributes } from "react";
import clsx from "clsx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * raised: a standalone floating surface (shadow) — e.g. the login card.
   * inset: a quieter tile that sits INSIDE a Panel — canvas-colored fill,
   * no shadow — so a panel full of tiles doesn't read as boxes-in-boxes.
   */
  variant?: "raised" | "inset";
}

export function Card({ variant = "raised", className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl border p-4",
        variant === "raised" ? "border-border bg-surface shadow-card" : "border-border/70 bg-inset",
        className,
      )}
      {...props}
    />
  );
}

export default Card;
