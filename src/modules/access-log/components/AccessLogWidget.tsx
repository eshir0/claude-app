import { requireSessionPage } from "@/lib/auth/guard";
import { getIpSummaries } from "@/modules/access-log/service";
import { AccessLogView } from "./AccessLogView";

export default async function AccessLogWidget() {
  await requireSessionPage();
  const summaries = await getIpSummaries();
  return <AccessLogView initialSummaries={summaries} />;
}
