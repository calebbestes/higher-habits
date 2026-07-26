import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";

import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import { DayPlanScreen } from "@/components/day-plan-screen";
import { MonthlyGoalsScreen } from "@/components/monthly-goals-screen";
import { SwipePageTransition } from "@/components/swipe-page-transition";
import {
  PLAN_REPORT_VIEW_HREFS,
  type PlanReportView,
  isPlanReportView,
  setPlanReportDateKey,
  setPlanReportView,
  useDefaultPlanReportView,
  usePlanReportDateKey,
} from "@/lib/tab-view-store";

const PLAN_REPORT_ORDER: readonly PlanReportView[] = [
  "day-plan",
  "monthly-plan",
];

export default function PlanReportScreen() {
  const router = useRouter();
  const { view, date } = useLocalSearchParams<{
    view?: string;
    date?: string;
  }>();
  const defaultView = useDefaultPlanReportView();
  const rememberedDateKey = usePlanReportDateKey();
  const activeView = isPlanReportView(view)
    ? view
    : isPlanReportView(defaultView)
      ? defaultView
      : "day-plan";
  const defaultPlanView = isPlanReportView(defaultView)
    ? defaultView
    : "day-plan";
  const activeDateKey = isDateKey(date)
    ? date
    : (rememberedDateKey ?? undefined);

  useEffect(() => {
    const legacyHref = getLegacyCreateHref(view);
    if (legacyHref) {
      router.replace(legacyHref as Href);
      return;
    }

    if (isPlanReportView(view)) {
      setPlanReportView(view);
      return;
    }

    setPlanReportView(defaultPlanView);
  }, [defaultPlanView, router, view]);

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

  if (activeView === "monthly-plan") {
    content = (
      <ComponentErrorBoundary name="MonthlyGoalsScreen">
        <MonthlyGoalsScreen
          initialDateKey={activeDateKey}
          onDateChange={setPlanReportDateKey}
        />
      </ComponentErrorBoundary>
    );
  } else {
    content = (
      <ComponentErrorBoundary name="DayPlanScreen">
        <DayPlanScreen
          initialDateKey={activeDateKey}
          onDateChange={setPlanReportDateKey}
        />
      </ComponentErrorBoundary>
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

function getLegacyCreateHref(view: string | undefined): string | null {
  if (view === "daily" || view === "habits") return "/add?type=habits";
  if (view === "goals") return "/add?type=goals";
  if (view === "top-tasks") return "/add?type=tasks";
  if (view === "monthly") return "/plan-report?view=monthly-plan";
  return null;
}

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
