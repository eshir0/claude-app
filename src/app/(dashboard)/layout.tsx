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
      <main className="flex-1 overflow-x-auto p-4 pt-[calc(3.5rem+1rem)] sm:p-6 sm:pt-[calc(3.5rem+1.5rem)]">
        {children}
      </main>
    </div>
  );
}
