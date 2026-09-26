"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

/**
 * The actual theme is only knowable client-side (see the inline
 * pre-paint script in app/layout.tsx) — rendering an icon that depends on
 * it during SSR would mismatch whatever the client-side script already
 * set before hydration. `mounted` stays false through the server render
 * and the first client render, then flips true in an effect; only after
 * that do we read/show the real state, avoiding a hydration warning.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private browsing / blocked storage: theme still applies for this
      // page load, just won't persist across visits.
    }
  }

  return (
    <IconButton type="button" onClick={toggle} title="테마 전환" aria-label="테마 전환">
      {mounted && (dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />)}
    </IconButton>
  );
}

export default ThemeToggle;
