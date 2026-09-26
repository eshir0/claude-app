"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

// Desktop-only ("hidden md:inline-flex" at the call site) — below md the
// sidebar is an overlay drawer, toggled by the separate hamburger button,
// not this collapse mechanism.
//
// Same hydration-safe pattern as ThemeToggle: the real collapsed state is
// only knowable client-side (see the inline pre-paint script in
// app/layout.tsx), so the icon renders nothing until after mount to avoid
// a server/client mismatch.
export function SidebarCollapseToggle() {
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(document.documentElement.classList.contains("sidebar-collapsed"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.classList.toggle("sidebar-collapsed", next);
    try {
      localStorage.setItem("sidebar-collapsed", String(next));
    } catch {
      // Private browsing / blocked storage: still applies for this page
      // load, just won't persist across visits.
    }
  }

  return (
    <IconButton
      type="button"
      onClick={toggle}
      title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
      aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
    >
      {mounted && (collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />)}
    </IconButton>
  );
}

export default SidebarCollapseToggle;
