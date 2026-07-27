import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { GoalIcon } from "@/components/goal-icon";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandedEmptyState } from "@/components/branded-empty-state";
import {
  CelebrationOverlay,
  confettiSource,
} from "@/components/celebration-overlay";
import { HabitFormModal } from "@/components/habits-manager-screen";
import { HabitsTabs } from "@/components/habits-tabs";
import { PlanReportHeaderMenu } from "@/components/plan-report-header-menu";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import { getLocalTimeZone } from "@/lib/google-calendar-client";
import {
  type HabitLogStatus,
  type HabitLogsSnapshot,
  type PeriodicHabitInfo,
  fetchHabitLogsSnapshot,
  getMonthKey,
  setHabitLog,
  toDateKey,
} from "@/lib/habit-logs-client";
import {
  type Category,
  type Habit,
  type HabitInput,
  type HabitRepeatMonthlyType,
  createCategory,
  createHabit,
  deleteHabit,
  fetchCategories,
  updateHabit,
} from "@/lib/habits-client";
import {
  cancelHabitReminderAsync,
  scheduleHabitReminderAsync,
} from "@/lib/push-notifications";
import type { HabitsTab } from "@/lib/tab-view-store";

type SymbolName = SymbolViewProps["name"];
type PlanningBucket = "scheduled" | "needs-planning" | "optional";

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 1,
};

const DAY_ABBRS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_NAMES_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_ABBRS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const TILE_SIZE = 16;
const TILE_GAP = 2;
const MAX_TILES = 3;
const PLANNED_STRIPES = Array.from(
  { length: 24 },
  (_, index) => `planned-stripe-${index}`,
);

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfWeekDate(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

function weeksBetween(ref: Date, d: Date): number {
  return Math.round(
    (startOfWeekDate(d).getTime() - startOfWeekDate(ref).getTime()) /
      (7 * 24 * 60 * 60 * 1000),
  );
}

function weekOfMonth(d: Date): number {
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() + 7 > daysInMonth) return 4;
  return Math.ceil(d.getDate() / 7) - 1;
}

function monthlyWeekdayCell(date: Date) {
  return weekOfMonth(date) * 7 + date.getDay();
}

function isGoalScheduledForDate(
  goal: import("@/lib/habit-logs-client").PeriodicHabitInfo,
  date: Date,
): boolean {
  if (goal.period === "daily") return true;
  const cadence = goal.repeatCadence ?? goal.period;
  const interval = goal.repeatInterval ?? 1;
  const dow = date.getDay();

  if (cadence === "weekly") {
    const days = goal.repeatDays;
    if (!days?.length) return false;
    if (!days.includes(dow)) return false;
    if (interval === 1) return true;
    return weeksBetween(new Date(goal.createdAt), date) % interval === 0;
  }

  if (cadence === "monthly") {
    const ref = new Date(goal.createdAt);
    const monthDiff =
      (date.getFullYear() - ref.getFullYear()) * 12 +
      (date.getMonth() - ref.getMonth());
    if (monthDiff % interval !== 0) return false;
    const type = goal.repeatMonthlyType ?? "day_of_month";
    if (type === "day_of_month") {
      const dates = goal.repeatDays?.filter((day) => day >= 1 && day <= 31);
      return dates?.length
        ? dates.includes(date.getDate())
        : date.getDate() === ref.getDate();
    }
    const cells = goal.repeatDays?.filter((day) => day >= 0 && day <= 34);
    if (!cells?.length)
      return monthlyWeekdayCell(date) === monthlyWeekdayCell(ref);
    if (cells.every((day) => day <= 6)) {
      return cells.includes(dow) && weekOfMonth(date) === weekOfMonth(ref);
    }
    return cells.includes(monthlyWeekdayCell(date));
  }

  return false;
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m as number) - 1, d as number);
}

function buildCalendarDays(
  year: number,
  month: number,
): { date: Date; isOutside: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const monthDate = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const count = lastDay.getDate() + startOffset > 35 ? 42 : 35;
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return { date, isOutside: !isSameMonth(date, monthDate) };
  });
}

function formatDayHeader(date: Date): string {
  return `${DAY_NAMES_FULL[date.getDay()]}, ${MONTH_ABBRS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

type MonthLogStatus = "complete" | "incomplete" | "planned";

function getGoalMonthProgress(
  goal: PeriodicHabitInfo,
  monthKey: string,
  calendarDays: { date: Date; isOutside: boolean }[],
  logsByHabitDate: Record<string, MonthLogStatus>,
): { completed: number; planned: number; target: number } {
  const target = Math.max(goal.frequencyGoal ?? 1, 1);
  const keyPrefix = `${goal.id}_${monthKey}`;
  let completed = 0;
  let planned = 0;

  for (const [key, status] of Object.entries(logsByHabitDate)) {
    if (!key.startsWith(keyPrefix)) continue;
    if (status === "complete") completed++;
    if (status === "planned") planned++;
  }

  for (const { date, isOutside } of calendarDays) {
    if (isOutside) continue;
    const dateKey = toDateKey(date);
    const key = `${goal.id}_${dateKey}`;
    if (logsByHabitDate[key]) continue;
    if (isGoalScheduledForDate(goal, date)) planned++;
  }

  return { completed, planned, target };
}

function isGoalPlannedForDate({
  date,
  dateKey,
  goal,
  logsByHabitDate,
}: {
  date: Date;
  dateKey: string;
  goal: PeriodicHabitInfo;
  logsByHabitDate: Record<string, MonthLogStatus>;
}) {
  const status = logsByHabitDate[`${goal.id}_${dateKey}`];
  if (status === "complete" || status === "planned") return true;
  if (status === "incomplete") return false;
  return isGoalScheduledForDate(goal, date);
}

export function MonthlyGoalsScreen({
  habitsTab,
  initialDateKey,
  onDateChange,
  onHabitsTabChange,
}: {
  habitsTab?: HabitsTab;
  initialDateKey?: string;
  onDateChange?: (dateKey: string) => void;
  onHabitsTabChange?: (tab: HabitsTab) => void;
}) {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const [displayMonth, setDisplayMonth] = useState(() => {
    const now =
      initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey)
        ? dateFromKey(initialDateKey)
        : new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey)
      ? initialDateKey
      : toDateKey(new Date()),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute "today" when the user navigates months (e.g. across midnight)
  const today = useMemo(() => new Date(), [displayMonth]);
  const todayDateKey = useMemo(() => toDateKey(today), [today]);
  const [snapshot, setSnapshot] = useState<HabitLogsSnapshot | null>(null);
  const [logsByHabitDate, setLogsByGoalDate] = useState<
    Record<string, MonthLogStatus>
  >({});
  const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    onDateChange?.(selectedDateKey);
  }, [onDateChange, selectedDateKey]);
  const [editingGoal, setEditingGoal] = useState<Habit | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const updatingKeysRef = useRef(updatingKeys);
  updatingKeysRef.current = updatingKeys;
  const logsByHabitDateRef = useRef(logsByHabitDate);
  logsByHabitDateRef.current = logsByHabitDate;
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);

  const monthKey = useMemo(() => getMonthKey(displayMonth), [displayMonth]);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const load = useCallback(
    async (refresh = false) => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);
      try {
        const [snap, cats] = await Promise.all([
          fetchHabitLogsSnapshot(monthKey),
          fetchCategories(),
        ]);
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }
        setSnapshot(snap);
        setLogsByGoalDate(snap.logsByHabitDate);
        setCategories(cats);
      } catch (err) {
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load habits.");
      } finally {
        if (isMountedRef.current && requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [monthKey],
  );

  const saveGoal = async (input: HabitInput) => {
    const saved = editingGoal
      ? await updateHabit(editingGoal.id, input)
      : await createHabit(input);
    try {
      await scheduleHabitReminderAsync(saved);
    } catch (reminderError) {
      Alert.alert(
        "Reminder not scheduled",
        reminderError instanceof Error
          ? reminderError.message
          : "Could not schedule this habit reminder.",
      );
    }
    await load();
    setFormOpen(false);
    setEditingGoal(null);
  };

  const addCategory = async (name: string, icon: string): Promise<Category> => {
    const cat = await createCategory({ name, icon });
    setCategories((prev) => [...prev, cat]);
    return cat;
  };

  const openEdit = (goal: PeriodicHabitInfo) => {
    const category = categories.find((item) => item.id === goal.categoryId);
    const repeatMonthlyType: HabitRepeatMonthlyType | null =
      goal.repeatMonthlyType === "day_of_week" ||
      goal.repeatMonthlyType === "day_of_month"
        ? goal.repeatMonthlyType
        : goal.period === "monthly"
          ? "day_of_month"
          : null;
    setEditingGoal({
      ...goal,
      categoryName: category?.name ?? "",
      categoryIcon: category?.icon ?? "",
      goalId: goal.goalId,
      goalTitle: goal.goalTitle,
      hidden: false,
      repeatCadence: goal.repeatCadence ?? goal.period,
      repeatInterval: goal.repeatInterval ?? 1,
      repeatDays: goal.repeatDays,
      repeatMonthlyType,
      createdAt: goal.createdAt,
      updatedAt: "",
      period: goal.period,
    });
    setFormOpen(true);
  };

  const confirmDelete = (goal: PeriodicHabitInfo) => {
    Alert.alert(
      "Delete habit?",
      `"${goal.name}" and its history will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteHabit(goal.id);
              await cancelHabitReminderAsync(goal.id);
              await load();
            } catch (deleteError) {
              setError(
                deleteError instanceof Error
                  ? deleteError.message
                  : "Could not delete habit.",
              );
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    void load();
  }, [load]);

  const handleSetStatus = useCallback(
    async (
      goalId: string,
      status: HabitLogStatus,
      options?: {
        endTime?: string | null;
        repeatPlan?: boolean;
        startTime?: string | null;
        timeZone?: string | null;
      },
    ) => {
      const key = `${goalId}_${selectedDateKey}`;
      if (updatingKeysRef.current.has(key)) return;
      const current = logsByHabitDateRef.current[key];

      if (status === "complete" && current !== "complete") {
        setCelebrate(true);
      }

      setUpdatingKeys((prev) => new Set(prev).add(key));
      setLogsByGoalDate((prev) => {
        const updated = { ...prev };
        updated[key] = status ?? "incomplete";
        return updated;
      });

      try {
        await setHabitLog(goalId, selectedDateKey, status, options);
        if (!isMountedRef.current) return;
        setSnapshot((currentSnapshot) => {
          if (!currentSnapshot) return currentSnapshot;

          const plannedTimesByHabitDate = {
            ...(currentSnapshot.plannedTimesByHabitDate ?? {}),
          };

          if (status === "planned") {
            plannedTimesByHabitDate[key] = {
              startTime: options?.startTime ?? null,
              endTime: options?.endTime ?? null,
              repeatsDaily: options?.repeatPlan ?? false,
            };
          } else {
            delete plannedTimesByHabitDate[key];
          }

          return { ...currentSnapshot, plannedTimesByHabitDate };
        });
      } catch (err) {
        if (!isMountedRef.current) return;
        setLogsByGoalDate((prev) => {
          const reverted = { ...prev };
          if (current) reverted[key] = current;
          else delete reverted[key];
          return reverted;
        });
        setError(err instanceof Error ? err.message : "Could not save.");
      } finally {
        if (isMountedRef.current) {
          setUpdatingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    },
    [selectedDateKey],
  );

  const toggleHabitForSelectedDay = useCallback(
    (goal: PeriodicHabitInfo) => {
      const selectedDate = dateFromKey(selectedDateKey);
      const key = `${goal.id}_${selectedDateKey}`;
      const status = logsByHabitDateRef.current[key];
      if (status === "complete") return;

      const isPlanned = isGoalPlannedForDate({
        date: selectedDate,
        dateKey: selectedDateKey,
        goal,
        logsByHabitDate: logsByHabitDateRef.current,
      });

      void handleSetStatus(goal.id, isPlanned ? null : "planned", {
        endTime: null,
        startTime: null,
        timeZone: getLocalTimeZone(),
      });
    },
    [handleSetStatus, selectedDateKey],
  );

  const openHabitMenu = (goal: PeriodicHabitInfo) => {
    Alert.alert(goal.name, undefined, [
      { text: "Edit habit", onPress: () => openEdit(goal) },
      {
        text: "Delete habit",
        style: "destructive",
        onPress: () => confirmDelete(goal),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const calendarDays = useMemo(
    () =>
      buildCalendarDays(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth],
  );

  const periodicHabits = useMemo(
    () => snapshot?.periodicHabits ?? [],
    [snapshot],
  );

  const monthProgressByGoal = useMemo(() => {
    const map: Record<string, ReturnType<typeof getGoalMonthProgress>> = {};
    for (const goal of periodicHabits) {
      map[goal.id] = getGoalMonthProgress(
        goal,
        monthKey,
        calendarDays,
        logsByHabitDate,
      );
    }
    return map;
  }, [periodicHabits, monthKey, calendarDays, logsByHabitDate]);

  const selectedDayHabitGroups = useMemo(() => {
    const selectedDate = dateFromKey(selectedDateKey);
    const buckets: Record<PlanningBucket, PeriodicHabitInfo[]> = {
      optional: [],
      scheduled: [],
      "needs-planning": [],
    };

    const remaining = (goal: PeriodicHabitInfo) => {
      const progress = monthProgressByGoal[goal.id];
      return Math.max(progress.target - progress.completed, 0);
    };

    const sortedHabits = [...periodicHabits].sort((left, right) => {
      const leftPlanned = isGoalPlannedForDate({
        date: selectedDate,
        dateKey: selectedDateKey,
        goal: left,
        logsByHabitDate,
      });
      const rightPlanned = isGoalPlannedForDate({
        date: selectedDate,
        dateKey: selectedDateKey,
        goal: right,
        logsByHabitDate,
      });
      if (leftPlanned !== rightPlanned) return leftPlanned ? -1 : 1;

      const leftRemaining = remaining(left);
      const rightRemaining = remaining(right);
      if (Boolean(leftRemaining) !== Boolean(rightRemaining)) {
        return leftRemaining ? -1 : 1;
      }

      if (left.period !== right.period) {
        return left.period === "weekly" ? -1 : 1;
      }

      const priorityCompare =
        PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
      return priorityCompare || left.name.localeCompare(right.name);
    });

    for (const goal of sortedHabits) {
      const isPlanned = isGoalPlannedForDate({
        date: selectedDate,
        dateKey: selectedDateKey,
        goal,
        logsByHabitDate,
      });

      if (isPlanned) {
        buckets.scheduled.push(goal);
      } else if (remaining(goal) > 0) {
        buckets["needs-planning"].push(goal);
      } else {
        buckets.optional.push(goal);
      }
    }

    return buckets;
  }, [logsByHabitDate, monthProgressByGoal, periodicHabits, selectedDateKey]);

  const dayLoggedMap = useMemo(() => {
    const map: Record<string, PeriodicHabitInfo[]> = {};
    for (const { date } of calendarDays) {
      const dk = toDateKey(date);
      map[dk] = periodicHabits.filter((goal) =>
        isGoalPlannedForDate({
          date,
          dateKey: dk,
          goal,
          logsByHabitDate,
        }),
      );
    }
    return map;
  }, [calendarDays, periodicHabits, logsByHabitDate]);

  const selectedDate = dateFromKey(selectedDateKey);

  const navigateMonth = useCallback((delta: 1 | -1) => {
    setDisplayMonth((m) => {
      const newMonth = addMonths(m, delta);
      setSelectedDateKey(toDateKey(newMonth));
      return newMonth;
    });
  }, []);

  const goToToday = useCallback(() => {
    setDisplayMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDateKey(todayDateKey);
  }, [today, todayDateKey]);

  const isCurrentMonth = isSameMonth(displayMonth, today);
  const monthLabel = `${MONTH_NAMES[displayMonth.getMonth()]} ${displayMonth.getFullYear()}`;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          canCancelContentTouches
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          directionalLockEnabled
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={theme.primary}
              onRefresh={() => void load(true)}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Page header */}
          <View style={styles.pageHeader}>
            <View style={[styles.pageHeaderText, { flex: 1 }]}>
              <PlanReportHeaderMenu currentView="monthly-plan" />
            </View>
            <Pressable
              accessibilityLabel="Add habit"
              accessibilityRole="button"
              onPress={() => setFormOpen(true)}
              style={({ pressed }) => [
                styles.addButton,
                styles.headerAddButton,
                { backgroundColor: theme.primary },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("plus", "add")}
                size={18}
                weight="semibold"
                tintColor={theme.primaryForeground}
              />
            </Pressable>
          </View>

          {habitsTab && onHabitsTabChange ? (
            <HabitsTabs value={habitsTab} onChange={onHabitsTabChange} />
          ) : null}

          {/* Month navigator */}
          <View
            style={[
              styles.monthNav,
              { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
            ]}
          >
            <Pressable
              accessibilityLabel="Previous month"
              hitSlop={8}
              onPress={() => navigateMonth(-1)}
              style={({ pressed }) => [
                styles.navArrow,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("chevron.left", "chevron_left")}
                size={18}
                weight="semibold"
                tintColor={theme.tabIcon}
              />
            </Pressable>
            <Text style={[styles.monthLabel, { color: theme.text }]}>
              {monthLabel}
            </Text>
            <View style={styles.monthNavRight}>
              {!isCurrentMonth ? (
                <Pressable
                  onPress={goToToday}
                  style={({ pressed }) => [
                    styles.todayBtn,
                    { borderColor: theme.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.todayBtnText, { color: theme.primary }]}>
                    Today
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel="Next month"
                hitSlop={8}
                onPress={() => navigateMonth(1)}
                style={({ pressed }) => [
                  styles.navArrow,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("chevron.right", "chevron_right")}
                  size={18}
                  weight="semibold"
                  tintColor={theme.tabIcon}
                />
              </Pressable>
            </View>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBanner}>
              <SymbolView
                name={sym("exclamationmark.circle.fill", "error")}
                size={16}
                tintColor="#9D474D"
              />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Calendar grid */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <FloatingLogoLoader />
            </View>
          ) : (
            <CalendarGrid
              days={calendarDays}
              dayLoggedMap={dayLoggedMap}
              logsByHabitDate={logsByHabitDate}
              todayDateKey={todayDateKey}
              selectedDateKey={selectedDateKey}
              onDayPress={setSelectedDateKey}
            />
          )}

          {/* Selected day detail panel */}
          {!isLoading ? (
            <DayDetailPanel
              selectedDate={selectedDate}
              selectedDateKey={selectedDateKey}
              monthKey={monthKey}
              habitGroups={selectedDayHabitGroups}
              hasMonthlyGoals={periodicHabits.length > 0}
              logsByHabitDate={logsByHabitDate}
              monthProgressByGoal={monthProgressByGoal}
              selectedDateStatus={(goal) =>
                isGoalPlannedForDate({
                  date: selectedDate,
                  dateKey: selectedDateKey,
                  goal,
                  logsByHabitDate,
                })
              }
              updatingKeys={updatingKeys}
              onMoreGoal={openHabitMenu}
              onToggleGoal={toggleHabitForSelectedDay}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <HabitFormModal
        categories={categories}
        habit={editingGoal}
        initialValues={{ period: "monthly" }}
        isOpen={formOpen}
        onAddCategory={addCategory}
        onClose={() => {
          setFormOpen(false);
          setEditingGoal(null);
        }}
        onSave={saveGoal}
      />

      <CelebrationOverlay
        visible={celebrate}
        source={confettiSource}
        withLogo
        onDone={() => setCelebrate(false)}
      />
    </View>
  );
}

function CalendarGrid({
  days,
  dayLoggedMap,
  logsByHabitDate,
  todayDateKey,
  selectedDateKey,
  onDayPress,
}: {
  days: { date: Date; isOutside: boolean }[];
  dayLoggedMap: Record<string, PeriodicHabitInfo[]>;
  logsByHabitDate: Record<string, MonthLogStatus>;
  todayDateKey: string;
  selectedDateKey: string;
  onDayPress: (dateKey: string) => void;
}) {
  const theme = useTheme();
  const weeks: { date: Date; isOutside: boolean }[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <View
      style={[
        styles.calendar,
        { borderColor: theme.tabBorder, backgroundColor: theme.tabBar },
      ]}
    >
      {/* Day-of-week header */}
      <View
        style={[styles.dayHeaderRow, { borderBottomColor: theme.tabBorder }]}
      >
        {DAY_ABBRS.map((abbr, colIdx) => (
          <View
            key={DAY_NAMES_FULL[colIdx]}
            style={[
              styles.dayHeaderCell,
              colIdx < 6 && {
                borderRightColor: theme.tabBorder,
                borderRightWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <Text
              style={[styles.dayHeaderText, { color: theme.textSecondary }]}
            >
              {abbr}
            </Text>
          </View>
        ))}
      </View>

      {/* Week rows */}
      {weeks.map((week) => (
        <View
          key={toDateKey(week[0]?.date ?? new Date(0))}
          style={[
            styles.weekRow,
            week !== weeks[weeks.length - 1] && {
              borderBottomColor: theme.tabBorder,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          {week.map(({ date, isOutside }, di) => {
            const dk = toDateKey(date);
            return (
              <DayCell
                key={dk}
                date={date}
                dateKey={dk}
                isOutside={isOutside}
                isToday={dk === todayDateKey}
                isSelected={dk === selectedDateKey}
                loggedGoals={dayLoggedMap[dk] ?? []}
                logsByHabitDate={logsByHabitDate}
                isLastInRow={di === 6}
                onPress={onDayPress}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const DayCell = memo(function DayCell({
  date,
  dateKey,
  isOutside,
  isToday,
  isSelected,
  loggedGoals,
  logsByHabitDate,
  isLastInRow,
  onPress,
}: {
  date: Date;
  dateKey: string;
  isOutside: boolean;
  isToday: boolean;
  isSelected: boolean;
  loggedGoals: PeriodicHabitInfo[];
  logsByHabitDate: Record<string, MonthLogStatus>;
  isLastInRow: boolean;
  onPress: (dateKey: string) => void;
}) {
  const theme = useTheme();
  const visibleGoals = loggedGoals.slice(0, MAX_TILES);
  const overflow = loggedGoals.length - MAX_TILES;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}${isToday ? ", today" : ""}`}
      onPress={() => onPress(dateKey)}
      style={({ pressed }) => [
        styles.cell,
        !isLastInRow && {
          borderRightColor: theme.tabBorder,
          borderRightWidth: StyleSheet.hairlineWidth,
        },
        isSelected && { backgroundColor: `${theme.primary}18` },
        isOutside && styles.cellOutside,
        pressed && styles.pressed,
      ]}
    >
      {/* Day number circle */}
      <View
        style={[
          styles.dayNumCircle,
          isToday && { backgroundColor: theme.primary },
          !isToday &&
            isSelected && {
              borderWidth: 1.5,
              borderColor: theme.primary,
            },
        ]}
      >
        <Text
          style={[
            styles.dayNum,
            {
              color: isToday
                ? theme.primaryForeground
                : isSelected
                  ? theme.primary
                  : theme.text,
            },
          ]}
        >
          {date.getDate()}
        </Text>
      </View>

      {/* Icon tiles for logged habits */}
      {visibleGoals.length > 0 ? (
        <View style={styles.tilesRow}>
          {visibleGoals.map((goal) => {
            const status = logsByHabitDate[`${goal.id}_${dateKey}`];
            const isComplete = status === "complete";
            const isPlanned = status === "planned";
            return (
              <View
                key={goal.id}
                style={[
                  styles.iconTile,
                  {
                    backgroundColor: isComplete
                      ? theme.primary
                      : isPlanned
                        ? `${theme.primary}24`
                        : theme.backgroundElement,
                    borderColor: isPlanned ? theme.primary : "transparent",
                    borderWidth: isPlanned ? StyleSheet.hairlineWidth : 0,
                  },
                ]}
              >
                <GoalIcon
                  iconKey={goal.iconKey}
                  size={9}
                  color={isComplete ? theme.primaryForeground : theme.primary}
                />
              </View>
            );
          })}
          {overflow > 0 ? (
            <View
              style={[
                styles.iconTile,
                styles.overflowTile,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <Text
                style={[styles.overflowText, { color: theme.textSecondary }]}
              >
                +{overflow}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
});

function DayDetailPanel({
  selectedDate,
  selectedDateKey,
  monthKey,
  habitGroups,
  hasMonthlyGoals,
  logsByHabitDate,
  monthProgressByGoal,
  selectedDateStatus,
  updatingKeys,
  onMoreGoal,
  onToggleGoal,
}: {
  selectedDate: Date;
  selectedDateKey: string;
  monthKey: string;
  habitGroups: Record<PlanningBucket, PeriodicHabitInfo[]>;
  hasMonthlyGoals: boolean;
  logsByHabitDate: Record<string, MonthLogStatus>;
  monthProgressByGoal: Record<
    string,
    { completed: number; planned: number; target: number }
  >;
  selectedDateStatus: (goal: PeriodicHabitInfo) => boolean;
  updatingKeys: Set<string>;
  onMoreGoal: (goal: PeriodicHabitInfo) => void;
  onToggleGoal: (goal: PeriodicHabitInfo) => void;
}) {
  const theme = useTheme();
  const sections: Array<{
    key: PlanningBucket;
    title: string;
    subtitle: string;
  }> = [
    {
      key: "scheduled",
      title: "Planned",
      subtitle: "Already on this day",
    },
    {
      key: "needs-planning",
      title: "Needs Planning",
      subtitle: "Still under target",
    },
    {
      key: "optional",
      title: "Optional",
      subtitle: "Already covered this month",
    },
  ];

  if (!hasMonthlyGoals) {
    return (
      <View style={styles.emptyState}>
        <BrandedEmptyState
          title="No periodic habits yet"
          description="Add periodic habits from the Habits section to track them here."
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.detailPanel,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      {/* Header */}
      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderLeft}>
          <Text style={[styles.detailDate, { color: theme.text }]}>
            {formatDayHeader(selectedDate)}
          </Text>
          <Text style={[styles.detailHint, { color: theme.textSecondary }]}>
            Tap a habit to add or remove it for this day
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.goalList,
          {
            borderTopColor: theme.tabBorder,
            borderBottomColor: theme.tabBorder,
          },
        ]}
      >
        {sections.some((section) => habitGroups[section.key].length > 0) ? (
          sections.map((section) => {
            const habits = habitGroups[section.key];
            if (habits.length === 0) return null;

            return (
              <View key={section.key} style={styles.planningSection}>
                <View style={styles.planningSectionHeader}>
                  <Text
                    style={[styles.planningSectionTitle, { color: theme.text }]}
                  >
                    {section.title}
                  </Text>
                  <Text
                    style={[
                      styles.planningSectionSubtitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {section.subtitle}
                  </Text>
                </View>
                {habits.map((goal, index) => (
                  <View key={goal.id}>
                    {index > 0 ? (
                      <View
                        style={[
                          styles.divider,
                          { backgroundColor: theme.tabBorder },
                        ]}
                      />
                    ) : null}
                    <PlanningGoalRow
                      goal={goal}
                      progress={
                        monthProgressByGoal[goal.id] ?? {
                          completed: 0,
                          planned: 0,
                          target: 1,
                        }
                      }
                      isPlanned={selectedDateStatus(goal)}
                      status={logsByHabitDate[`${goal.id}_${selectedDateKey}`]}
                      isUpdating={updatingKeys.has(
                        `${goal.id}_${selectedDateKey}`,
                      )}
                      onMore={() => onMoreGoal(goal)}
                      onToggle={() => onToggleGoal(goal)}
                    />
                  </View>
                ))}
              </View>
            );
          })
        ) : (
          <View style={styles.filteredEmptyState}>
            <Text style={[styles.filteredEmptyTitle, { color: theme.text }]}>
              No weekly or monthly habits
            </Text>
            <Text
              style={[
                styles.filteredEmptyDescription,
                { color: theme.textSecondary },
              ]}
            >
              Add a periodic habit to plan it here.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PlanningGoalRow({
  goal,
  progress,
  status,
  isPlanned,
  isUpdating,
  onMore,
  onToggle,
}: {
  goal: PeriodicHabitInfo;
  progress: { completed: number; planned: number; target: number };
  status: MonthLogStatus | undefined;
  isPlanned: boolean;
  isUpdating: boolean;
  onMore: () => void;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const isComplete = status === "complete";
  const plannedLabel = `${progress.planned}/${progress.target}`;
  const completedLabel = `${progress.completed}/${progress.target}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${progress.planned} planned and ${progress.completed} done this month. ${
        isPlanned
          ? "Planned for selected day."
          : "Not planned for selected day."
      }`}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.goalRow,
        isPlanned && { backgroundColor: `${theme.primary}10` },
        pressed && !isComplete && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.statusBox,
          {
            backgroundColor: isComplete
              ? theme.primary
              : isPlanned
                ? `${theme.primary}18`
                : "transparent",
            borderColor: isPlanned ? theme.primary : theme.tabBorder,
          },
        ]}
      >
        {isUpdating ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : isComplete ? (
          <SymbolView
            name={sym("checkmark", "check")}
            size={13}
            weight="bold"
            tintColor={theme.primaryForeground}
          />
        ) : isPlanned ? (
          <SymbolView
            name={sym("calendar", "calendar_today")}
            size={13}
            weight="bold"
            tintColor={theme.primary}
          />
        ) : null}
      </View>

      <View style={styles.goalIcon}>
        <GoalIcon
          filled
          iconKey={goal.iconKey}
          size={17}
          color={theme.primary}
        />
      </View>

      <View style={styles.goalInfo}>
        <Text
          numberOfLines={1}
          style={[
            styles.goalName,
            { color: isComplete ? theme.textSecondary : theme.text },
            isComplete && styles.completedText,
          ]}
        >
          {goal.name}
        </Text>
        <View style={styles.progressChipRow}>
          <ProgressChip
            icon={sym("calendar", "calendar_today")}
            label={plannedLabel}
          />
          <ProgressChip
            icon={sym("checkmark.circle", "check_circle")}
            label={completedLabel}
          />
          <Text style={[styles.periodPill, { color: theme.textSecondary }]}>
            {goal.period}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityLabel={`More options for ${goal.name}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          onMore();
        }}
        style={({ pressed }) => [
          styles.goalMenuButton,
          pressed && styles.pressed,
        ]}
      >
        <SymbolView
          name={sym("ellipsis", "more_horiz")}
          size={17}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </Pressable>
    </Pressable>
  );
}

function ProgressChip({ icon, label }: { icon: SymbolName; label: string }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.progressChip,
        { backgroundColor: theme.backgroundElement },
      ]}
    >
      <SymbolView name={icon} size={11} tintColor={theme.primary} />
      <Text style={[styles.progressChipText, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingTop: 20,
    paddingBottom: 40,
    gap: 18,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 42,
    paddingHorizontal: 18,
    position: "relative",
  },
  pageHeaderText: { gap: 1, paddingRight: 54 },
  addButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  headerAddButton: {
    position: "absolute",
    top: 0,
    right: 18,
    zIndex: 10,
    elevation: 10,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 56,
    marginHorizontal: 18,
  },
  navArrow: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  monthLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  monthNavRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  todayBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  todayBtnText: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#F3B7B933",
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginHorizontal: 18,
  },
  errorText: {
    flex: 1,
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  retryText: { color: "#9D474D", fontSize: 12, fontWeight: "800" },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  // Calendar
  calendar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  dayHeaderText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  weekRow: { flexDirection: "row" },
  cell: {
    flex: 1,
    minHeight: 76,
    paddingTop: 8,
    paddingBottom: 6,
    alignItems: "center",
    gap: 4,
  },
  cellOutside: { opacity: 0.35 },
  dayNumCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNum: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  tilesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: TILE_GAP,
    justifyContent: "center",
    maxWidth: TILE_SIZE * MAX_TILES + TILE_GAP * (MAX_TILES - 1) + 4,
  },
  iconTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  overflowTile: {},
  overflowText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
  },
  // Detail panel
  detailPanel: {
    marginHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: "hidden",
  },
  detailHeader: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 4,
  },
  detailHeaderLeft: { gap: 2 },
  detailDate: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  detailHint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  sectionLabelRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 7,
    paddingBottom: 7,
  },
  sectionLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  detailFilterButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  goalList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  planningSection: {
    paddingVertical: 8,
  },
  planningSectionHeader: {
    gap: 2,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 7,
  },
  planningSectionTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },
  planningSectionSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  filteredEmptyState: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  filteredEmptyTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  filteredEmptyDescription: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
  swipeActions: {
    width: 156,
    height: "100%",
    flexDirection: "row",
  },
  swipeAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  swipeActionLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  deleteSwipeAction: { backgroundColor: "#B84D54" },
  deleteSwipeActionLabel: { color: "#FFFFFF" },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 64,
  },
  goalIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  goalInfo: { flex: 1, gap: 2 },
  goalName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  progressChipRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  progressChip: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 7,
  },
  progressChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  periodPill: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  goalProgressTrack: {
    width: "100%",
    maxWidth: 190,
    height: 8,
    flexDirection: "row",
    borderRadius: 999,
    overflow: "hidden",
  },
  goalProgressCompleted: {
    height: "100%",
  },
  goalProgressPlanned: {
    height: "100%",
    overflow: "hidden",
  },
  plannedStripeRow: {
    position: "absolute",
    top: -7,
    bottom: -7,
    left: -8,
    right: -8,
    flexDirection: "row",
    gap: 6,
  },
  plannedStripe: {
    width: 3,
    height: 24,
    transform: [{ rotate: "32deg" }],
  },
  completedText: { textDecorationLine: "line-through" },
  statusBox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  planTimeBadge: {
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  planTimeBadgeTime: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  planTimeBadgePeriod: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  goalMenuButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    marginBottom: 2,
  },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  emptyDesc: {
    maxWidth: 260,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  filterOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000055",
    padding: 12,
  },
  filterSheet: {
    maxHeight: "90%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 25,
    padding: 8,
    paddingBottom: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  filterHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  filterTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  resetText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  disabled: { opacity: 0.45 },
  filterSectionTitle: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 5,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  filterOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  filterOptionLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  filterDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
    marginVertical: 8,
  },
  filterOptionsScroll: { flexShrink: 1 },
  doneButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    marginHorizontal: 6,
    marginTop: 10,
  },
  doneButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  pressed: { opacity: 0.72 },
});
