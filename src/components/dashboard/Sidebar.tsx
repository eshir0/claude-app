"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { resolveIcon } from "./icon-map";
import { LogoutButton } from "./LogoutButton";
import type { NavItem } from "@/modules/types";

const TOPBAR_HEIGHT = "h-14";

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  // Closing the drawer on navigation matters most on narrow screens, where
  // it overlays the content the link just navigated to.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header
        className={clsx(
          TOPBAR_HEIGHT,
          "fixed inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
          className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="rounded-md text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
        >
          내 대시보드
        </Link>
      </header>

      {open && (
        <div
          className="fixed inset-0 top-14 z-30 bg-black/30"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          "fixed bottom-0 left-0 top-14 z-40 flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white p-4 transition-transform duration-200 ease-in-out dark:border-zinc-800 dark:bg-zinc-950",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <SidebarLink href="/" label="홈" Icon={LayoutDashboard} active={pathname === "/"} onNavigate={() => setOpen(false)} />
          {items.map((item) => (
            <SidebarLink
              key={item.id}
              href={item.href}
              label={item.label}
              Icon={resolveIcon(item.iconKey)}
              active={pathname === item.href}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </nav>
        <LogoutButton />
      </aside>
    </>
  );
}

function SidebarLink({
  href,
  label,
  Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
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
