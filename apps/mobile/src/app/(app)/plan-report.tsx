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
  PlanReportProvider,
  PlanReportViewSlot,
} from "@/components/plan-report-context";
import {
  type WeekEvent,
  type WeeklyCreateRange,
  WeeklyPlanScreen,
} from "@/components/weekly-plan-screen";
import { reportMobileDiagnostic } from "@/lib/mobile-diagnostics";
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
  const routeDateKey = isDateKey(date) ? date : undefined;
  const activeView = isPlanReportView(view)
    ? view
    : isPlanReportView(rememberedView)
      ? rememberedView
      : "day-plan";
  const activePlanView =
    activeView === "weekly-plan" || activeView === "monthly-plan"
      ? activeView
      : "day-plan";
  const activeDateKey = routeDateKey ?? rememberedDateKey ?? undefined;
  const handleDateChange = useCallback(
    (dateKey: string) => {
      reportMobileDiagnostic("plan-report-date-change", {
        nextDateKey: dateKey,
        routeDate: routeDateKey ?? null,
      });
      setPlanReportDateKey(dateKey);
      if (routeDateKey === dateKey) {
        return;
      }
      router.setParams({ date: dateKey });
    },
    [routeDateKey, router],
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
    <PlanReportProvider
      activeDateKey={activeDateKey}
      activeView={activePlanView}
      onDateChange={handleDateChange}
    >
      <View style={styles.pageStack}>
        <View style={styles.page}>
          <PlanReportViewSlot view="day-plan">
            <ComponentErrorBoundary name="DayPlanScreen">
              <DayPlanScreen
                initialDateKey={activeDateKey}
                onDateChange={handleDateChange}
              />
            </ComponentErrorBoundary>
          </PlanReportViewSlot>
          <PlanReportViewSlot view="weekly-plan">
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
          </PlanReportViewSlot>
          <PlanReportViewSlot view="monthly-plan">
            <ComponentErrorBoundary name="MonthlyGoalsScreen">
              <MonthlyGoalsScreen
                initialDateKey={activeDateKey}
                onDateChange={handleDateChange}
              />
            </ComponentErrorBoundary>
          </PlanReportViewSlot>
        </View>
      </View>
    </PlanReportProvider>
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
