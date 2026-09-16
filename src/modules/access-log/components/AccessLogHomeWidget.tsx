import { requireSessionPage } from "@/lib/auth/guard";
import { getIpSummaries } from "@/modules/access-log/service";
import { AccessLogView } from "./AccessLogView";

// Home-page shows only high-traffic IPs (100+ hits) so a one-off visitor
// doesn't clutter the dashboard's front page — everything still shows up
// on the full /access-log page (AccessLogWidget, unfiltered).
const HOME_MIN_HIT_COUNT = 100;

export default async function AccessLogHomeWidget() {
  await requireSessionPage();
  const summaries = await getIpSummaries(50, HOME_MIN_HIT_COUNT);
  return (
    <AccessLogView
      initialSummaries={summaries}
      minHitCount={HOME_MIN_HIT_COUNT}
      note={`횟수 ${HOME_MIN_HIT_COUNT}회 이상만 표시 · 전체는 접속 기록 페이지에서`}
    />
  );
}
