import type { ReactNode } from "react";
import { requireSessionPage } from "@/lib/auth/guard";
import { getNavItems } from "@/modules/registry";
import { Sidebar } from "@/components/dashboard/Sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Repeats the check proxy.ts already did — proxy is a UX redirect, not the
  // security boundary (see proxy.ts's own comment). This layout wraps every
  // page under (dashboard), so this one call covers all of them.
  await requireSessionPage();
  const navItems = getNavItems();

  return (
    <div className="flex flex-1 flex-col">
      <Sidebar items={navItems} />
      {/* dashboard-main: the md+ padding-left is set by a plain CSS rule in
          globals.css keyed off the .sidebar-collapsed class (see
          SidebarCollapseToggle), not a Tailwind utility — it has to react
          to a runtime toggle the same way the dark-mode class does. */}
      <main className="dashboard-main flex-1 overflow-x-auto p-4 pt-[calc(3.5rem+1rem)] sm:p-6 sm:pt-[calc(3.5rem+1.5rem)] md:pb-8 md:pr-8 md:pt-[4.25rem]">
        {/* Caps line length on very wide screens so the bento keeps its
            proportions instead of stretching edge to edge. */}
        <div className="mx-auto w-full max-w-[100rem]">{children}</div>
      </main>
    </div>
  );
}
