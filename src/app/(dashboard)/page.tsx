import { modules } from "@/modules/registry";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">홈</h1>
      {modules.map((mod) => (
        <section key={mod.id} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-500">{mod.label}</h2>
          <mod.HomeWidget />
        </section>
      ))}
    </div>
  );
}
