"use client";

import { useLayoutEffect } from "react";

/**
 * Re-applies the persisted theme/sidebar classes on <html> after React
 * commits. Needed because when hydration fails anywhere in the tree (e.g.
 * server-vs-browser date formatting), React re-renders from the root and
 * its html-singleton acquisition strips every attribute React didn't set
 * itself — wiping the classes the pre-paint script in app/layout.tsx
 * added. A layout effect runs in that same commit, before paint, so the
 * restore is invisible. Mirror of that script's logic; keep them in sync.
 */
export function PreferenceClassSync() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    try {
      const stored = localStorage.getItem("theme");
      const dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", dark);
      root.classList.toggle("sidebar-collapsed", localStorage.getItem("sidebar-collapsed") === "true");
    } catch {
      // Blocked storage: keep whatever the pre-paint script managed to set.
    }
  }, []);
  return null;
}

export default PreferenceClassSync;
