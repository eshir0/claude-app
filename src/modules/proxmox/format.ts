// Pure formatting helpers — no server-only, so they're trivially unit
// testable and safe to import from client components.

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 GB";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

const WARN_THRESHOLD = 0.75;
const CRITICAL_THRESHOLD = 0.9;

export type UsageSeverity = "ok" | "warning" | "critical";

/** Same 0.75/0.9 thresholds usageLevelClass has always used, as a category
 * rather than a Tailwind string — for callers (e.g. a colored progress bar)
 * that need more than just text color out of the same severity judgement. */
export function usageSeverity(fraction: number): UsageSeverity {
  if (fraction >= CRITICAL_THRESHOLD) return "critical";
  if (fraction >= WARN_THRESHOLD) return "warning";
  return "ok";
}

/** Tailwind text-color classes for a 0-1 usage fraction — "" (inherit) below
 * the warn threshold, so callers can just interpolate this into className
 * without an extra conditional. */
export function usageLevelClass(fraction: number): string {
  const severity = usageSeverity(fraction);
  if (severity === "critical") return "text-red-600 dark:text-red-400";
  if (severity === "warning") return "text-amber-600 dark:text-amber-400";
  return "";
}

// AMD Ryzen desktop CPUs (this app's only verified case — see sensors.ts)
// typically throttle/shut down around 95°C (Tctl) — these give headroom
// before that, not a universal threshold for any chip.
const TEMP_WARN_C = 80;
const TEMP_CRITICAL_C = 90;

export function tempLevelClass(celsius: number): string {
  if (celsius >= TEMP_CRITICAL_C) return "text-red-600 dark:text-red-400";
  if (celsius >= TEMP_WARN_C) return "text-amber-600 dark:text-amber-400";
  return "";
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}초`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}
