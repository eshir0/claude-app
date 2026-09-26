import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

// `type` is intentionally NOT defaulted here — forwarded exactly like a
// native <button>, so every call site stays responsible for declaring
// type="button" (icon/action buttons) or type="submit" (form submit)
// explicitly, same as the rest of this codebase already does. Adding an
// implicit default here would silently change that behavior at every
// existing call site that passes through this component.
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary"
          ? "bg-accent text-accent-foreground hover:opacity-90"
          : "border border-border bg-surface text-text hover:bg-bg",
        className,
      )}
      {...props}
    />
  );
}

export default Button;
