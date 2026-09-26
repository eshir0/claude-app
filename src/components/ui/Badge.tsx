import type { HTMLAttributes } from "react";
import clsx from "clsx";

// Semantic variants (success/warning/danger) map to the app's existing
// green/amber/red severity convention — never the violet accent. `accent`
// and `neutral` are the only two non-semantic, brand-accent-adjacent
// options, for badges that aren't communicating status.
type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-bg text-text-muted",
  accent: "bg-accent/15 text-accent",
  success: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}

export default Badge;
