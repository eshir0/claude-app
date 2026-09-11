import "server-only";
import type { ModuleManifest, NavItem } from "./types";
import { aiUsageModule } from "./ai-usage/manifest";
import { proxmoxModule } from "./proxmox/manifest";
import { lottoModule } from "./lotto/manifest";

// Adding a module here wires it into the sidebar and the home page widget
// grid automatically. It does NOT create the module's own pages, API
// routes, or (if needed) Prisma schema/migrations — those still have to be
// written; the registry only removes the need to touch the shell
// (layout/sidebar/home) code to surface a module that already exists.
//
// Order here is also render order on the home page (see
// app/(dashboard)/page.tsx) — lottoModule is listed last so it renders as
// the bottom-most section, per the placement the user chose for it.
export const modules: ModuleManifest[] = [aiUsageModule, proxmoxModule, lottoModule];

export function getNavItems(): NavItem[] {
  return modules.map(({ id, label, href, iconKey }) => ({ id, label, href, iconKey }));
}
