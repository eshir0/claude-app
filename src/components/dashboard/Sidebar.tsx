"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { resolveIcon } from "./icon-map";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggle } from "./ThemeToggle";
import { SidebarCollapseToggle } from "./SidebarCollapseToggle";
import type { NavItem } from "@/modules/types";

const TOPBAR_HEIGHT = "h-14";
// Below md: the edge-to-edge drawer width. At md+ the sidebar floats (inset
// 1rem from the edge, md:w-60) — keep that in sync with --sidebar-w in
// globals.css, which is the offset <main> reserves for it.
const SIDEBAR_WIDTH = "w-64";

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Closing the drawer on navigation matters most on narrow screens, where
  // it overlays the content the link just navigated to. At md+ the
  // sidebar defaults to persistent (see the aside's md: classes below) so
  // `open` is irrelevant there — desktop has its own, separate collapse
  // mechanism instead (SidebarCollapseToggle, driven by a class on
  // <html> rather than this component's state — see globals.css).
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
          // At md+ the bar dissolves into the canvas (no border, canvas
          // colour) so the floating sidebar and cards read as the only
          // surfaces; below md it stays a solid app bar for the drawer.
          "fixed inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-border bg-surface px-4 md:border-transparent md:bg-bg md:px-6",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
          className="rounded-full p-2 text-text-muted hover:bg-bg md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="hidden md:inline-flex">
          <SidebarCollapseToggle />
        </div>
        <Link href="/" onClick={() => setOpen(false)} className="rounded-md text-sm font-semibold text-text hover:opacity-80">
          내 대시보드
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 top-14 z-30 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          SIDEBAR_WIDTH,
          "dashboard-aside fixed bottom-0 left-0 top-14 z-40 flex shrink-0 flex-col border-r border-border bg-surface p-4 transition-transform duration-200 ease-in-out",
          // Floating desktop surface: inset from the viewport, rounded,
          // same elevation language as the dashboard panels.
          "md:bottom-4 md:left-4 md:top-[4.25rem] md:w-60 md:translate-x-0 md:rounded-3xl md:border md:p-3 md:shadow-card",
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
        "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent/15 text-accent" : "text-text-muted hover:bg-bg",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
