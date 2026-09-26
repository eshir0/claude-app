import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

// Icon-only — every call site MUST pass aria-label (no visible text for
// assistive tech to read otherwise). Not enforced at the type level to
// avoid over-engineering a single small component, but every existing
// call site in this codebase already follows this convention.
type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function IconButton({ className, ...props }: IconButtonProps) {
  return (
    <button
      className={clsx(
        "rounded-full p-1.5 text-text-muted transition-colors hover:bg-bg disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export default IconButton;
