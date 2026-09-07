"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type MutationResult = { ok: true } | { ok: false; error: string };

interface AiUsageDataContextValue {
  /** Bumped on every successful delete. HistoryTable/UsageChart re-fetch
   * their own data whenever this changes — this is what makes "the same
   * hook called in two places" into "actually shared state": both read the
   * same version number from one Context instance. */
  version: number;
  deleteEntry: (id: string) => Promise<MutationResult>;
}

const AiUsageDataContext = createContext<AiUsageDataContextValue | null>(null);

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function AiUsageDataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);

  const deleteEntry = useCallback(async (id: string): Promise<MutationResult> => {
    const res = await fetch(`/api/ai-usage/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      return { ok: false, error: await readErrorMessage(res, `삭제 실패 (${res.status})`) };
    }
    setVersion((v) => v + 1);
    return { ok: true };
  }, []);

  return (
    <AiUsageDataContext.Provider value={{ version, deleteEntry }}>
      {children}
    </AiUsageDataContext.Provider>
  );
}

export function useAiUsageData(): AiUsageDataContextValue {
  const ctx = useContext(AiUsageDataContext);
  if (!ctx) {
    throw new Error("useAiUsageData must be used within <AiUsageDataProvider>");
  }
  return ctx;
}
