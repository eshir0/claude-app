import { modules } from "@/modules/registry";

// Home-page placement is presentation-only, so it lives here rather than in
// the module registry (whose order also drives the sidebar). `hidden`
// modules keep their sidebar entry and their own page — they're just not
// shown on the home dashboard. A module missing from this map still
// renders — full-width, after the mapped ones.
const HOME_LAYOUT: Record<string, { order: number; span: string; hidden?: boolean }> = {
  "ai-usage": { order: 0, span: "lg:col-span-12" },
  lotto: { order: 1, span: "lg:col-span-12", hidden: true },
  proxmox: { order: 2, span: "lg:col-span-12" },
  "access-log": { order: 3, span: "lg:col-span-12" },
};
const FALLBACK = { order: Number.MAX_SAFE_INTEGER, span: "lg:col-span-12", hidden: false };

export default function HomePage() {
  const placed = modules
    .filter((m) => !(HOME_LAYOUT[m.id] ?? FALLBACK).hidden)
    .sort((a, b) => (HOME_LAYOUT[a.id] ?? FALLBACK).order - (HOME_LAYOUT[b.id] ?? FALLBACK).order);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">홈</h1>
        <p className="text-sm text-text-muted">{placed.map((m) => m.label).join(" · ")}</p>
      </header>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 xl:gap-6">
        {placed.map((mod) => (
          <div key={mod.id} className={`min-w-0 ${(HOME_LAYOUT[mod.id] ?? FALLBACK).span}`}>
            <mod.HomeWidget title={mod.label} />
          </div>
        ))}
      </div>
    </div>
  );
}
