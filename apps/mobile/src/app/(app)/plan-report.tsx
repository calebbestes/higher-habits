import { useLocalSearchParams } from "expo-router";

import { DailyGoalsScreen } from "@/components/daily-goals-screen";
import { MonthlyGoalsScreen } from "@/components/monthly-goals-screen";
import { TopTasksScreen } from "@/components/top-tasks-screen";

export default function PlanReportScreen() {
  const { view, date } = useLocalSearchParams<{
    view?: string;
    date?: string;
  }>();

  if (!view || view === "daily") {
    return <DailyGoalsScreen initialDateKey={date} />;
  }

  if (view === "monthly") {
    return <MonthlyGoalsScreen />;
  }

  if (view === "top-tasks") {
    return <TopTasksScreen />;
  }

  return <DailyGoalsScreen initialDateKey={date} />;
}
