import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import {
  type DayPlanCreateRange,
  type DayPlanEventTarget,
  DayPlanScreen,
} from "@/components/day-plan-screen";
import { MonthlyGoalsScreen } from "@/components/monthly-goals-screen";
import {
  type WeekEvent,
  type WeeklyCreateRange,
  WeeklyPlanScreen,
} from "@/components/weekly-plan-screen";
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
  const handleDateChange = useCallback(
    (dateKey: string) => {
      setPlanReportDateKey(dateKey);
      router.setParams({ date: dateKey });
    },
    [router],
  );
  const [pendingEventTarget, setPendingEventTarget] =
    useState<DayPlanEventTarget | null>(null);
  const [pendingCreateRange, setPendingCreateRange] =
    useState<DayPlanCreateRange | null>(null);
  const openDailyForDate = useCallback(
    (dateKey: string) => {
      setPendingEventTarget(null);
      setPendingCreateRange(null);
      setPlanReportDateKey(dateKey);
      setPlanReportView("day-plan");
      router.setParams({ date: dateKey, view: "day-plan" });
    },
    [router],
  );
  const openDailyForEvent = useCallback((event: WeekEvent) => {
    const entryId =
      event.sourceType === "google"
        ? event.id
        : event.plannedEventId
          ? `planned-${event.plannedEventId}`
          : event.sourceType === "habit_instance" && event.sourceId
            ? `habit-${event.sourceId}`
            : null;

    if (!entryId) {
      return;
    }

    setPendingEventTarget({ dateKey: event.date, entryId });
  }, []);
  const openCreateRange = useCallback((range: WeeklyCreateRange) => {
    setPendingEventTarget(null);
    setPendingCreateRange(range);
    setPlanReportDateKey(range.dateKey);
  }, []);

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
      <View style={styles.page}>
        {activeView === "day-plan" ? (
          <ComponentErrorBoundary name="DayPlanScreen">
            <DayPlanScreen
              initialDateKey={activeDateKey}
              initialEventTarget={pendingEventTarget}
              onDateChange={handleDateChange}
            />
          </ComponentErrorBoundary>
        ) : null}
        {activeView === "weekly-plan" ? (
          <ComponentErrorBoundary name="WeeklyPlanScreen">
            <WeeklyPlanScreen
              initialDateKey={activeDateKey}
              onCreateRange={openCreateRange}
              onDateChange={handleDateChange}
              onSelectEvent={openDailyForEvent}
              onSelectDate={openDailyForDate}
            />
            {pendingEventTarget ? (
              <DayPlanScreen
                initialDateKey={pendingEventTarget.dateKey}
                initialEventTarget={pendingEventTarget}
                modalOnly
                onEventOverlayDismiss={() => setPendingEventTarget(null)}
              />
            ) : null}
            {pendingCreateRange ? (
              <DayPlanScreen
                initialCreateRange={pendingCreateRange}
                initialDateKey={pendingCreateRange.dateKey}
                modalOnly
                onEventOverlayDismiss={() => setPendingCreateRange(null)}
              />
            ) : null}
          </ComponentErrorBoundary>
        ) : null}
        {activeView === "monthly-plan" ? (
          <ComponentErrorBoundary name="MonthlyGoalsScreen">
            <MonthlyGoalsScreen
              initialDateKey={activeDateKey}
              onDateChange={handleDateChange}
            />
          </ComponentErrorBoundary>
        ) : null}
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
  page: { flex: 1 },
  pageStack: { flex: 1 },
});
