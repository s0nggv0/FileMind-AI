import { KnowledgeOverview } from "./knowledge-overview";
import { AIInsights } from "./ai-insights";
import { RecentFiles } from "./recent-files";
import { ActivityTimeline } from "./activity-timeline";
import { KnowledgeTopics } from "./knowledge-topics";
import { QuickActions } from "./quick-actions";
import type { getDashboardPresentation } from "@/services/presentation-repository";

export function Overview({ data }: { data: ReturnType<typeof getDashboardPresentation> }) {
  return (
    <div className="space-y-9 sm:space-y-10">
      <KnowledgeOverview metrics={data.overview} topicCount={data.topicCount} />
      <AIInsights insights={data.dashboardInsights} />
      <div className="grid gap-9 xl:grid-cols-[1.6fr_1fr]">
        <RecentFiles documents={data.recentFiles} />
        <ActivityTimeline groups={data.dashboardActivityGroups} />
      </div>
      <KnowledgeTopics topics={data.dashboardTopics} />
      <QuickActions actions={data.dashboardQuickActions} />
    </div>
  );
}
