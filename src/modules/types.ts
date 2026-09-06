import type { ComponentType } from "react";

/**
 * What the common dashboard shell needs to know about a module. Kept to
 * serializable nav metadata + a component reference — the shell (layout,
 * sidebar) never imports a module's service/DB code, only this.
 */
export interface ModuleManifest {
  id: string;
  label: string;
  href: string;
  /** Resolved to an actual icon by src/components/dashboard/icon-map.ts — never a module-specific import in the shell. */
  iconKey: string;
  /** Server Component rendered on the home dashboard for this module. */
  HomeWidget: ComponentType;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  iconKey: string;
}
