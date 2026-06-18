import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";

import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import { GoalsScreen } from "@/components/goals-screen";
import { HabitsScreen } from "@/components/habits-screen";
import { TopTasksScreen } from "@/components/top-tasks-screen";
import {
  type HabitsTab,
  isPlanReportView,
  setHabitsTab,
  setPlanReportView,
  usePlanReportView,
} from "@/lib/tab-view-store";

export default function PlanReportScreen() {
  const router = useRouter();
  const { view, date } = useLocalSearchParams<{
    view?: string;
    date?: string;
  }>();
  // Prefer the URL param (deep links / web), but fall back to the remembered
  // view so switching tabs and returning restores where you were.
  const rememberedView = usePlanReportView();
  const legacyHabitsTab = isLegacyHabitsTab(view) ? view : undefined;
  const activeView = legacyHabitsTab
    ? "habits"
    : isPlanReportView(view)
      ? view
      : rememberedView;

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
