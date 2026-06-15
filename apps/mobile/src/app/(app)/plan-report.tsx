import { useLocalSearchParams } from "expo-router";

import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import { DailyGoalsScreen } from "@/components/daily-goals-screen";
import { MonthlyGoalsScreen } from "@/components/monthly-goals-screen";
import { TopTasksScreen } from "@/components/top-tasks-screen";

export default function PlanReportScreen() {
  const { view, date } = useLocalSearchParams<{
    view?: string;
    date?: string;
  }>();

  if (view === "monthly") {
    return (
      <ComponentErrorBoundary name="MonthlyGoalsScreen">
        <MonthlyGoalsScreen />
      </ComponentErrorBoundary>
    );
  }

  if (view === "top-tasks") {
    return (
      <ComponentErrorBoundary name="TopTasksScreen">
        <TopTasksScreen />
      </ComponentErrorBoundary>
    );
  }

  return (
    <ComponentErrorBoundary name="DailyGoalsScreen">
      <DailyGoalsScreen initialDateKey={date} />
    </ComponentErrorBoundary>
  );
}
