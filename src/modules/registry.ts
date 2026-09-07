import "server-only";
import type { ModuleManifest, NavItem } from "./types";
import { aiUsageModule } from "./ai-usage/manifest";
import { proxmoxModule } from "./proxmox/manifest";

// Adding a module here wires it into the sidebar and the home page widget
// grid automatically. It does NOT create the module's own pages, API
// routes, or (if needed) Prisma schema/migrations — those still have to be
// written; the registry only removes the need to touch the shell
// (layout/sidebar/home) code to surface a module that already exists.
export const modules: ModuleManifest[] = [aiUsageModule, proxmoxModule];

export function getNavItems(): NavItem[] {
  return modules.map(({ id, label, href, iconKey }) => ({ id, label, href, iconKey }));
}
