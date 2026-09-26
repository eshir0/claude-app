"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="w-full rounded-xl px-3 py-2 text-left text-sm text-text-muted hover:bg-bg disabled:opacity-50"
    >
      {pending ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
