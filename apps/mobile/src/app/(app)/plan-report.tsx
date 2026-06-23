import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";

import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import { DayPlanScreen } from "@/components/day-plan-screen";
import { GoalsScreen } from "@/components/goals-screen";
import { HabitsScreen } from "@/components/habits-screen";
import { TopTasksScreen } from "@/components/top-tasks-screen";
import {
  type HabitsTab,
  isPlanReportView,
  setHabitsTab,
  setPlanReportView,
} from "@/lib/tab-view-store";

export default function PlanReportScreen() {
  const router = useRouter();
  const { view, date } = useLocalSearchParams<{
    view?: string;
    date?: string;
  }>();
  const legacyHabitsTab = isLegacyHabitsTab(view) ? view : undefined;
  const activeView = legacyHabitsTab
    ? "habits"
    : isPlanReportView(view)
      ? view
      : "day-plan";

  useEffect(() => {
    if (legacyHabitsTab) {
      setPlanReportView("habits");
      setHabitsTab(legacyHabitsTab);
      router.replace("/plan-report?view=habits");
      return;
    }

    if (isPlanReportView(view)) {
      setPlanReportView(view);
    }
  }, [legacyHabitsTab, router, view]);

  if (activeView === "day-plan") {
    return (
      <ComponentErrorBoundary name="DayPlanScreen">
        <DayPlanScreen initialDateKey={date} />
      </ComponentErrorBoundary>
    );
  }

  if (activeView === "top-tasks") {
    return (
      <ComponentErrorBoundary name="TopTasksScreen">
        <TopTasksScreen />
      </ComponentErrorBoundary>
    );
  }

  if (activeView === "goals") {
    return (
      <ComponentErrorBoundary name="GoalsScreen">
        <GoalsScreen />
      </ComponentErrorBoundary>
    );
  }

  return <HabitsScreen initialDateKey={date} initialTab={legacyHabitsTab} />;
}

function isLegacyHabitsTab(view: string | undefined): view is HabitsTab {
  return view === "daily" || view === "monthly";
}
