"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? `로그인에 실패했습니다. (${res.status})`);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      // A rejected fetch (network error, connection reset, blocked request)
      // previously left the button stuck on "로그인 중..." forever with no
      // feedback, because nothing downstream of the await ever ran.
      setError(
        err instanceof Error
          ? `요청이 실패했습니다: ${err.message}`
          : "요청이 실패했습니다. 네트워크 연결을 확인해주세요.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-sm p-0">
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <h1 className="text-lg font-semibold text-text">로그인</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" disabled={pending || !password} className="w-full">
            {pending ? "로그인 중..." : "로그인"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
