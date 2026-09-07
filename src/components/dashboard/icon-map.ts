import { BarChart3, LayoutDashboard, Server, type LucideIcon } from "lucide-react";

// Generic iconKey -> icon mapping, not tied to any specific module id. A new
// module just needs to declare an existing iconKey (or a new one added here)
// in its manifest — the sidebar never hardcodes a module's identity.
const ICONS: Record<string, LucideIcon> = {
  "bar-chart": BarChart3,
  server: Server,
};

const DEFAULT_ICON: LucideIcon = LayoutDashboard;

export function resolveIcon(iconKey: string): LucideIcon {
  return ICONS[iconKey] ?? DEFAULT_ICON;
}
