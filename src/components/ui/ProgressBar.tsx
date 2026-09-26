import clsx from "clsx";

interface ProgressBarProps {
  /** Percent, 0-100 — clamped internally, callers don't need to pre-clamp. */
  value: number;
  className?: string;
  /** Fill color — defaults to the accent, but callers (ai-usage, proxmox)
   * pass their own green/amber/red severity class here instead, since
   * severity is semantic and must never be overridden by the brand accent. */
  indicatorClassName?: string;
}

export function ProgressBar({ value, className, indicatorClassName }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx("h-1.5 w-full rounded-full bg-track", className)}>
      <div
        className={clsx("h-1.5 rounded-full transition-[width]", indicatorClassName ?? "bg-accent")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default ProgressBar;
