import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import { DayPlanScreen } from "@/components/day-plan-screen";
import { MonthlyGoalsScreen } from "@/components/monthly-goals-screen";
import { WeeklyPlanScreen } from "@/components/weekly-plan-screen";
import {
  PLAN_REPORT_VIEW_HREFS,
  type PlanReportView,
  isPlanReportView,
  setPlanReportDateKey,
  setPlanReportView,
  usePlanReportDateKey,
  usePlanReportView,
} from "@/lib/tab-view-store";

export default function PlanReportScreen() {
  const router = useRouter();
  const { view, date } = useLocalSearchParams<{
    view?: string;
    date?: string;
  }>();
  const rememberedView = usePlanReportView();
  const rememberedDateKey = usePlanReportDateKey();
  const activeView = isPlanReportView(view)
    ? view
    : isPlanReportView(rememberedView)
      ? rememberedView
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
    }
  }, [router, view]);

  return (
    <View style={styles.pageStack}>
      <View
        style={[styles.page, activeView !== "day-plan" && styles.inactivePage]}
      >
        <ComponentErrorBoundary name="DayPlanScreen">
          <DayPlanScreen
            initialDateKey={activeDateKey}
            onDateChange={setPlanReportDateKey}
          />
        </ComponentErrorBoundary>
      </View>
      <View
        style={[
          styles.page,
          activeView !== "weekly-plan" && styles.inactivePage,
        ]}
      >
        <ComponentErrorBoundary name="WeeklyPlanScreen">
          <WeeklyPlanScreen
            initialDateKey={activeDateKey}
            onDateChange={setPlanReportDateKey}
          />
        </ComponentErrorBoundary>
      </View>
      <View
        style={[
          styles.page,
          activeView !== "monthly-plan" && styles.inactivePage,
        ]}
      >
        <ComponentErrorBoundary name="MonthlyGoalsScreen">
          <MonthlyGoalsScreen
            initialDateKey={activeDateKey}
            onDateChange={setPlanReportDateKey}
          />
        </ComponentErrorBoundary>
      </View>
    </View>
  );
}

function getLegacyCreateHref(view: string | undefined): string | null {
  if (view === "daily" || view === "habits") return "/add?type=habits";
  if (view === "goals") return "/add?type=goals";
  if (view === "top-tasks") return "/add?type=tasks";
  if (view === "weekly") return "/plan-report?view=weekly-plan";
  if (view === "monthly") return "/plan-report?view=monthly-plan";
  return null;
}

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

const styles = StyleSheet.create({
  inactivePage: { display: "none" },
  page: { flex: 1 },
  pageStack: { flex: 1 },
});
