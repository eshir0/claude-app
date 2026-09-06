"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard } from "lucide-react";
import { resolveIcon } from "./icon-map";
import { LogoutButton } from "./LogoutButton";
import type { NavItem } from "@/modules/types";

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-6 px-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        내 대시보드
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        <SidebarLink href="/" label="홈" Icon={LayoutDashboard} active={pathname === "/"} />
        {items.map((item) => (
          <SidebarLink
            key={item.id}
            href={item.href}
            label={item.label}
            Icon={resolveIcon(item.iconKey)}
            active={pathname === item.href}
          />
        ))}
      </nav>
      <LogoutButton />
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
