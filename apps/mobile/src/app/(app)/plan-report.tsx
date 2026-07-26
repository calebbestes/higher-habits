import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";

import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import { DayPlanScreen } from "@/components/day-plan-screen";
import { GoalsScreen } from "@/components/goals-screen";
import { HabitsScreen } from "@/components/habits-screen";
import { SwipePageTransition } from "@/components/swipe-page-transition";
import { TopTasksScreen } from "@/components/top-tasks-screen";
import {
  type HabitsTab,
  PLAN_REPORT_VIEW_HREFS,
  type PlanReportView,
  isPlanReportView,
  setHabitsTab,
  setPlanReportDateKey,
  setPlanReportView,
  useDefaultPlanReportView,
  usePlanReportDateKey,
} from "@/lib/tab-view-store";

const PLAN_REPORT_ORDER: readonly PlanReportView[] = [
  "day-plan",
  "habits",
  "goals",
  "top-tasks",
];

export default function PlanReportScreen() {
  const router = useRouter();
  const { view, date } = useLocalSearchParams<{
    view?: string;
    date?: string;
  }>();
  const defaultView = useDefaultPlanReportView();
  const rememberedDateKey = usePlanReportDateKey();
  const legacyHabitsTab = isLegacyHabitsTab(view) ? view : undefined;
  const activeView = legacyHabitsTab
    ? "habits"
    : isPlanReportView(view)
      ? view
      : defaultView;
  const activeDateKey = isDateKey(date)
    ? date
    : (rememberedDateKey ?? undefined);

  useEffect(() => {
    if (legacyHabitsTab) {
      setPlanReportView("habits");
      setHabitsTab(legacyHabitsTab);
      router.replace("/plan-report?view=habits");
      return;
    }

    if (isPlanReportView(view)) {
      setPlanReportView(view);
      return;
    }

    setPlanReportView(defaultView);
  }, [defaultView, legacyHabitsTab, router, view]);

  const changeView = useCallback(
    (nextView: PlanReportView) => {
      setPlanReportView(nextView);
      const href = PLAN_REPORT_VIEW_HREFS[nextView];
      router.replace(
        (activeDateKey ? `${href}&date=${activeDateKey}` : href) as Href,
      );
    },
    [activeDateKey, router],
  );

  let content: ReactNode;

  if (activeView === "day-plan") {
    content = (
      <ComponentErrorBoundary name="DayPlanScreen">
        <DayPlanScreen
          initialDateKey={activeDateKey}
          onDateChange={setPlanReportDateKey}
        />
      </ComponentErrorBoundary>
    );
  } else if (activeView === "top-tasks") {
    content = (
      <ComponentErrorBoundary name="TopTasksScreen">
        <TopTasksScreen />
      </ComponentErrorBoundary>
    );
  } else if (activeView === "goals") {
    content = (
      <ComponentErrorBoundary name="GoalsScreen">
        <GoalsScreen />
      </ComponentErrorBoundary>
    );
  } else {
    content = (
      <HabitsScreen
        initialDateKey={activeDateKey}
        initialTab={legacyHabitsTab}
        onDateChange={setPlanReportDateKey}
      />
    );
  }

  return (
    <SwipePageTransition
      activeKey={activeView}
      orderedKeys={PLAN_REPORT_ORDER}
      onChange={changeView}
    >
      {content}
    </SwipePageTransition>
  );
}

function isLegacyHabitsTab(view: string | undefined): view is HabitsTab {
  return view === "daily" || view === "monthly";
}

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
