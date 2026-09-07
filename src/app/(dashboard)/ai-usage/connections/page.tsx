import { requireSessionPage } from "@/lib/auth/guard";
import ConnectPanel from "@/modules/ai-usage/collector/components/ConnectPanel";

export default async function ConnectionsPage() {
  await requireSessionPage();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">자동 수집 연결</h1>
      <ConnectPanel />
    </div>
  );
}
