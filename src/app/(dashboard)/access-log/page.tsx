import AccessLogWidget from "@/modules/access-log/components/AccessLogWidget";

export default function AccessLogPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">접속 기록</h1>
      <AccessLogWidget />
    </div>
  );
}
