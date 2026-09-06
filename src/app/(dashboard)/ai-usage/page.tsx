import { AiUsageDataProvider } from "@/modules/ai-usage/components/AiUsageDataProvider";
import EntryForm from "@/modules/ai-usage/components/EntryForm";
import HistoryTable from "@/modules/ai-usage/components/HistoryTable";
import UsageChart from "@/modules/ai-usage/components/UsageChart";
import CardsWidget from "@/modules/ai-usage/components/CardsWidget";

export default function AiUsagePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">AI 사용량</h1>
      {/* Server Component — reflects the same requireSessionPage()-gated
          data as the home widget, rendered fresh on every navigation here. */}
      <CardsWidget />
      <AiUsageDataProvider>
        <EntryForm />
        <UsageChart />
        <HistoryTable />
      </AiUsageDataProvider>
    </div>
  );
}
