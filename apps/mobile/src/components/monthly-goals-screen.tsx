import { GoalIcon } from "@/components/goal-icon";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CelebrationOverlay,
  confettiSource,
} from "@/components/celebration-overlay";
import { GoalLogVisibilityControl } from "@/components/goal-log-visibility-control";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { HabitFormModal } from "@/components/habits-manager-screen";
import { HabitsTabs } from "@/components/habits-tabs";
import { PlanReportHeaderMenu } from "@/components/plan-report-header-menu";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import { captureHandledError } from "@/lib/crash-reporting";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import { uploadGoalPhoto } from "@/lib/goal-photos-client";
import { getLocalTimeZone } from "@/lib/google-calendar-client";
import {
  type HabitLogStatus,
  type HabitLogsSnapshot,
  type PeriodicHabitInfo,
  fetchHabitLogsSnapshot,
  getMonthKey,
  setHabitLog,
  setHabitLogNote,
  setHabitLogVisibility,
  toDateKey,
} from "@/lib/habit-logs-client";
import {
  type Category,
  type Habit,
  type HabitInput,
  type HabitVisibility,
  createCategory,
  createHabit,
  deleteHabit,
  fetchCategories,
  updateHabit,
} from "@/lib/habits-client";
import type { HabitsTab } from "@/lib/tab-view-store";

type SymbolName = SymbolViewProps["name"];
type SortKey = "priority" | "frequency" | "remaining";
type PeriodFilter = "all" | "monthly" | "weekly";

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 1,
};

const SORT_OPTIONS: {
  key: SortKey;
  label: string;
  icon: [string, string];
}[] = [
  {
    key: "priority",
    label: "Priority",
    icon: ["exclamationmark.circle", "priority_high"],
  },
  {
    key: "frequency",
    label: "Frequency",
    icon: ["repeat", "repeat"],
  },
  {
    key: "remaining",
    label: "Completions remaining",
    icon: ["hourglass.bottomhalf.filled", "pending_actions"],
  },
];

const PERIOD_FILTER_OPTIONS: {
  key: PeriodFilter;
  label: string;
  icon: [string, string];
}[] = [
  {
    key: "all",
    label: "All periods",
    icon: ["square.grid.2x2", "apps"],
  },
  {
    key: "monthly",
    label: "Monthly",
    icon: ["calendar", "calendar_month"],
  },
  {
    key: "weekly",
    label: "Weekly",
    icon: ["calendar.badge.clock", "date_range"],
  },
];

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

function isGoalScheduledForDate(
  goal: import("@/lib/habit-logs-client").PeriodicHabitInfo,
  date: Date,
): boolean {
  if (goal.period === "daily") return true;
  const interval = goal.repeatInterval ?? 1;
  const dow = date.getDay();

  if (goal.period === "weekly") {
    const days = goal.repeatDays;
    if (days && days.length > 0 && !days.includes(dow)) return false;
    if (interval === 1) return true;
    return weeksBetween(new Date(goal.createdAt), date) % interval === 0;
  }

  if (goal.period === "monthly") {
    const ref = new Date(goal.createdAt);
    const monthDiff =
      (date.getFullYear() - ref.getFullYear()) * 12 +
      (date.getMonth() - ref.getMonth());
    if (monthDiff % interval !== 0) return false;
    const type = goal.repeatMonthlyType ?? "day_of_month";
    if (type === "day_of_month") return date.getDate() === ref.getDate();
    return dow === ref.getDay() && weekOfMonth(date) === weekOfMonth(ref);
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

function getGoalMonthProgress(
  goal: PeriodicHabitInfo,
  monthKey: string,
  logsByHabitDate: Record<string, "complete" | "planned">,
): { completed: number; planned: number; target: number } {
  const target = goal.frequencyGoal ?? 1;
  const keyPrefix = `${goal.id}_${monthKey}`;
  let completed = 0;
  let planned = 0;

  for (const [key, status] of Object.entries(logsByHabitDate)) {
    if (!key.startsWith(keyPrefix)) continue;
    if (status === "complete") completed++;
    if (status === "planned") planned++;
  }

  return { completed, planned, target };
}

export function MonthlyGoalsScreen({
  habitsTab,
  onHabitsTabChange,
}: {
  habitsTab?: HabitsTab;
  onHabitsTabChange?: (tab: HabitsTab) => void;
}) {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const [displayMonth, setDisplayMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    toDateKey(new Date()),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute "today" when the user navigates months (e.g. across midnight)
  const today = useMemo(() => new Date(), [displayMonth]);
  const todayDateKey = useMemo(() => toDateKey(today), [today]);
  const [snapshot, setSnapshot] = useState<HabitLogsSnapshot | null>(null);
  const [logsByHabitDate, setLogsByGoalDate] = useState<
    Record<string, "complete" | "planned">
  >({});
  const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGoal, setActiveGoal] = useState<PeriodicHabitInfo | null>(null);
  const [noteGoal, setNoteGoal] = useState<PeriodicHabitInfo | null>(null);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Habit | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const [sort, setSort] = useState<SortKey>("priority");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sortFilterOpen, setSortFilterOpen] = useState(false);
  const updatingKeysRef = useRef(updatingKeys);
  updatingKeysRef.current = updatingKeys;
  const logsByHabitDateRef = useRef(logsByHabitDate);
  logsByHabitDateRef.current = logsByHabitDate;
  const isLoadingRef = useRef(false);

  const monthKey = useMemo(() => getMonthKey(displayMonth), [displayMonth]);

  const load = useCallback(
    async (refresh = false) => {
      if (isLoadingRef.current && !refresh) return;
      isLoadingRef.current = true;
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);
      try {
        const [snap, cats] = await Promise.all([
          fetchHabitLogsSnapshot(monthKey),
          fetchCategories(),
        ]);
        setSnapshot(snap);
        setLogsByGoalDate(snap.logsByHabitDate);
        setCategories(cats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load habits.");
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [monthKey],
  );

  const saveGoal = async (input: HabitInput) => {
    if (editingGoal) {
      await updateHabit(editingGoal.id, input);
    } else {
      await createHabit(input);
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
    setEditingGoal({
      ...goal,
      categoryName: category?.name ?? "",
      categoryIcon: category?.icon ?? "",
      goalId: goal.goalId,
      goalTitle: goal.goalTitle,
      hidden: false,
      repeatInterval: null,
      repeatDays: null,
      repeatMonthlyType: null,
      createdAt: "",
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
        if (status) updated[key] = status;
        else delete updated[key];
        return updated;
      });

      try {
        await setHabitLog(goalId, selectedDateKey, status, options);
        setSnapshot((currentSnapshot) => {
          if (!currentSnapshot) return currentSnapshot;

          const plannedTimesByHabitDate = {
            ...(currentSnapshot.plannedTimesByHabitDate ?? {}),
          };

          if (status === "planned") {
            plannedTimesByHabitDate[key] = {
              startTime: options?.startTime ?? null,
              endTime: options?.endTime ?? null,
            };
          } else {
            delete plannedTimesByHabitDate[key];
          }

          return { ...currentSnapshot, plannedTimesByHabitDate };
        });
      } catch (err) {
        setLogsByGoalDate((prev) => {
          const reverted = { ...prev };
          if (current) reverted[key] = current;
          else delete reverted[key];
          return reverted;
        });
        setError(err instanceof Error ? err.message : "Could not save.");
      } finally {
        setUpdatingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [selectedDateKey],
  );

  const handleSaveNote = useCallback(
    async (goalId: string, notes: string) => {
      await setHabitLogNote(goalId, selectedDateKey, notes);
      const snap = await fetchHabitLogsSnapshot(monthKey);
      setSnapshot(snap);
      setLogsByGoalDate(snap.logsByHabitDate);
    },
    [monthKey, selectedDateKey],
  );

  const handleAddPhoto = useCallback(
    async (goalId: string, source: GoalPhotoSource) => {
      if (uploadingPhotoSource) return;
      setUploadingPhotoSource(source);

      try {
        const photo = await pickGoalPhoto(source);
        if (!photo) return;

        await uploadGoalPhoto(goalId, selectedDateKey, photo);
        const snap = await fetchHabitLogsSnapshot(monthKey);
        setSnapshot(snap);
        setLogsByGoalDate(snap.logsByHabitDate);
      } catch (photoError) {
        Alert.alert(
          "Could not add photo",
          photoError instanceof Error
            ? photoError.message
            : "The photo could not be uploaded.",
        );
      } finally {
        setUploadingPhotoSource(null);
      }
    },
    [monthKey, selectedDateKey, uploadingPhotoSource],
  );

  const handleSetVisibility = useCallback(
    async (goalId: string, visibility: HabitVisibility) => {
      if (isUpdatingVisibility) return;
      const key = `${goalId}_${selectedDateKey}`;
      setIsUpdatingVisibility(true);

      try {
        await setHabitLogVisibility(goalId, selectedDateKey, visibility);
        setSnapshot((current) =>
          current
            ? {
                ...current,
                visibilityByHabitDate: {
                  ...current.visibilityByHabitDate,
                  [key]: visibility,
                },
              }
            : current,
        );
      } catch (visibilityError) {
        Alert.alert(
          "Could not change visibility",
          visibilityError instanceof Error
            ? visibilityError.message
            : "The post visibility could not be changed.",
        );
      } finally {
        setIsUpdatingVisibility(false);
      }
    },
    [isUpdatingVisibility, selectedDateKey],
  );

  const calendarDays = useMemo(
    () =>
      buildCalendarDays(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth],
  );

  const periodicHabits = useMemo(
    () => snapshot?.periodicHabits ?? [],
    [snapshot],
  );

  const filterCategories = useMemo(() => {
    const categoryIds = new Set(periodicHabits.map((goal) => goal.categoryId));
    return categories
      .filter((category) => categoryIds.has(category.id))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [categories, periodicHabits]);

  const monthProgressByGoal = useMemo(() => {
    const map: Record<string, ReturnType<typeof getGoalMonthProgress>> = {};
    for (const goal of periodicHabits) {
      map[goal.id] = getGoalMonthProgress(goal, monthKey, logsByHabitDate);
    }
    return map;
  }, [periodicHabits, monthKey, logsByHabitDate]);

  const visiblePeriodicGoals = useMemo(() => {
    const remaining = (goal: PeriodicHabitInfo) => {
      const progress = monthProgressByGoal[goal.id];
      return Math.max(progress.target - progress.completed, 0);
    };

    return periodicHabits
      .filter(
        (goal) =>
          (categoryFilter === null || goal.categoryId === categoryFilter) &&
          (periodFilter === "all" || goal.period === periodFilter),
      )
      .sort((left, right) => {
        const priorityCompare =
          PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
        const frequencyCompare =
          (right.frequencyGoal ?? -1) - (left.frequencyGoal ?? -1);
        const remainingCompare = remaining(right) - remaining(left);

        if (sort === "frequency") {
          return (
            frequencyCompare ||
            priorityCompare ||
            left.name.localeCompare(right.name)
          );
        }

        if (sort === "remaining") {
          return (
            remainingCompare ||
            priorityCompare ||
            left.name.localeCompare(right.name)
          );
        }

        return (
          priorityCompare ||
          frequencyCompare ||
          left.name.localeCompare(right.name)
        );
      });
  }, [categoryFilter, monthProgressByGoal, periodFilter, periodicHabits, sort]);

  const dayLoggedMap = useMemo(() => {
    const map: Record<string, PeriodicHabitInfo[]> = {};
    for (const { date } of calendarDays) {
      const dk = toDateKey(date);
      map[dk] = periodicHabits.filter(
        (goal) =>
          !!logsByHabitDate[`${goal.id}_${dk}`] ||
          isGoalScheduledForDate(goal, date),
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

  const openGoalActions = (goal: PeriodicHabitInfo) => setActiveGoal(goal);

  const isCurrentMonth = isSameMonth(displayMonth, today);
  const monthLabel = `${MONTH_NAMES[displayMonth.getMonth()]} ${displayMonth.getFullYear()}`;

  // Defensive, self-reporting derivation of the goal-actions modal props. Every
  // snapshot sub-map and goal field is optional-chained with a fallback so a
  // malformed/incomplete goal (e.g. missing visibility from the API) can't
  // throw during render. If it somehow still does, we capture exactly which
  // goal shape caused it instead of an opaque "convert undefined" crash.
  let modalProps: {
    hasNote: boolean;
    hasPhoto: boolean;
    plannedTime: { startTime: string | null; endTime: string | null } | null;
    visibility: HabitVisibility;
    status: "complete" | "planned" | undefined;
    isUpdating: boolean;
  } = {
    hasNote: false,
    hasPhoto: false,
    plannedTime: null,
    visibility: "only_me",
    status: undefined,
    isUpdating: false,
  };
  if (activeGoal) {
    try {
      const key = `${activeGoal.id}_${selectedDateKey}`;
      modalProps = {
        hasNote: Boolean(snapshot?.notesByHabitDate?.[key]?.trim()),
        hasPhoto: (snapshot?.photoCountsByHabitDate?.[key] ?? 0) > 0,
        plannedTime: snapshot?.plannedTimesByHabitDate?.[key] ?? null,
        visibility:
          snapshot?.visibilityByHabitDate?.[key] ??
          activeGoal.visibility ??
          "only_me",
        status: logsByHabitDate?.[key],
        isUpdating: updatingKeys.has(key),
      };
    } catch (modalError) {
      captureHandledError(modalError, {
        goalId: activeGoal.id,
        goalKeys: Object.keys(activeGoal).join(","),
        hasNotesMap: Boolean(snapshot?.notesByHabitDate),
        hasPhotoMap: Boolean(snapshot?.photoCountsByHabitDate),
        hasSnapshot: Boolean(snapshot),
        hasVisibilityMap: Boolean(snapshot?.visibilityByHabitDate),
        phase: "compute-modal-props",
        selectedDateKey,
      });
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
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
              <PlanReportHeaderMenu currentView="habits" />
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
              <ActivityIndicator color={theme.primary} size="large" />
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
              periodicHabits={visiblePeriodicGoals}
              hasMonthlyGoals={periodicHabits.length > 0}
              isFilterActive={
                sort !== "priority" ||
                periodFilter !== "all" ||
                categoryFilter !== null
              }
              isFilterOpen={sortFilterOpen}
              logsByHabitDate={logsByHabitDate}
              updatingKeys={updatingKeys}
              onDeleteGoal={confirmDelete}
              onEditGoal={openEdit}
              onOpenSortFilter={() => setSortFilterOpen(true)}
              onPressGoal={openGoalActions}
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

      <GoalActionsModal
        goal={activeGoal}
        hasNote={modalProps.hasNote}
        hasPhoto={modalProps.hasPhoto}
        visibility={modalProps.visibility}
        isUpdatingVisibility={isUpdatingVisibility}
        plannedTime={modalProps.plannedTime ?? undefined}
        status={modalProps.status}
        isUpdating={modalProps.isUpdating}
        selectedDateKey={selectedDateKey}
        todayDateKey={todayDateKey}
        uploadingPhotoSource={uploadingPhotoSource}
        visible={Boolean(activeGoal)}
        onAddPhoto={(source) => {
          if (activeGoal) {
            void handleAddPhoto(activeGoal.id, source);
          }
        }}
        onOpenNote={() => {
          if (!activeGoal) return;
          setNoteGoal(activeGoal);
          setActiveGoal(null);
        }}
        onSetVisibility={(visibility) => {
          if (activeGoal) {
            void handleSetVisibility(activeGoal.id, visibility);
          }
        }}
        onSetStatus={(newStatus: HabitLogStatus, planOptions) => {
          if (!activeGoal) return;
          void handleSetStatus(activeGoal.id, newStatus, planOptions);
          setActiveGoal(null);
        }}
        onDismiss={() => setActiveGoal(null)}
      />
      {noteGoal ? (
        <GoalNoteEditorModal
          dateKey={selectedDateKey}
          goalName={noteGoal.name}
          initialValue={
            snapshot?.notesByHabitDate[`${noteGoal.id}_${selectedDateKey}`] ??
            null
          }
          onClose={() => setNoteGoal(null)}
          onSave={async (notes) => {
            await handleSaveNote(noteGoal.id, notes);
            setActiveGoal(noteGoal);
          }}
        />
      ) : null}

      <SortFilterModal
        categories={filterCategories}
        categoryFilter={categoryFilter}
        isOpen={sortFilterOpen}
        periodFilter={periodFilter}
        sort={sort}
        onCategoryChange={setCategoryFilter}
        onClose={() => setSortFilterOpen(false)}
        onPeriodChange={setPeriodFilter}
        onReset={() => {
          setSort("priority");
          setPeriodFilter("all");
          setCategoryFilter(null);
        }}
        onSortChange={setSort}
      />
      <CelebrationOverlay
        visible={celebrate}
        source={confettiSource}
        onDone={() => setCelebrate(false)}
      />
    </View>
  );
}

function SortFilterModal({
  categories,
  categoryFilter,
  isOpen,
  periodFilter,
  sort,
  onCategoryChange,
  onClose,
  onPeriodChange,
  onReset,
  onSortChange,
}: {
  categories: Category[];
  categoryFilter: string | null;
  isOpen: boolean;
  periodFilter: PeriodFilter;
  sort: SortKey;
  onCategoryChange: (categoryId: string | null) => void;
  onClose: () => void;
  onPeriodChange: (period: PeriodFilter) => void;
  onReset: () => void;
  onSortChange: (sort: SortKey) => void;
}) {
  const theme = useTheme();
  const hasChanges =
    sort !== "priority" || periodFilter !== "all" || categoryFilter !== null;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={isOpen}
    >
      <View style={styles.filterOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.filterSheet,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          <View style={styles.filterHeader}>
            <Text style={[styles.filterTitle, { color: theme.text }]}>
              Sort and filter
            </Text>
            <Pressable
              accessibilityLabel="Reset sort and filter"
              disabled={!hasChanges}
              hitSlop={8}
              onPress={onReset}
            >
              <Text
                style={[
                  styles.resetText,
                  { color: hasChanges ? theme.primary : theme.textSecondary },
                  !hasChanges && styles.disabled,
                ]}
              >
                Reset
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.filterOptionsScroll}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={[
                styles.filterSectionTitle,
                { color: theme.textSecondary },
              ]}
            >
              Sort by
            </Text>
            {SORT_OPTIONS.map((option) => (
              <FilterOption
                key={option.key}
                icon={sym(option.icon[0], option.icon[1])}
                label={option.label}
                selected={sort === option.key}
                onPress={() => onSortChange(option.key)}
              />
            ))}

            <View
              style={[
                styles.filterDivider,
                { backgroundColor: theme.tabBorder },
              ]}
            />

            <Text
              style={[
                styles.filterSectionTitle,
                { color: theme.textSecondary },
              ]}
            >
              Filter by period
            </Text>
            {PERIOD_FILTER_OPTIONS.map((option) => (
              <FilterOption
                key={option.key}
                icon={sym(option.icon[0], option.icon[1])}
                label={option.label}
                selected={periodFilter === option.key}
                onPress={() => onPeriodChange(option.key)}
              />
            ))}

            <View
              style={[
                styles.filterDivider,
                { backgroundColor: theme.tabBorder },
              ]}
            />

            <Text
              style={[
                styles.filterSectionTitle,
                { color: theme.textSecondary },
              ]}
            >
              Filter by category
            </Text>
            <FilterOption
              icon={sym("square.grid.2x2", "apps")}
              label="All categories"
              selected={categoryFilter === null}
              onPress={() => onCategoryChange(null)}
            />
            {categories.map((category) => (
              <FilterOption
                key={category.id}
                icon={sym("folder", "folder")}
                label={category.name}
                selected={categoryFilter === category.id}
                onPress={() => onCategoryChange(category.id)}
              />
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.doneButton,
              { backgroundColor: theme.primary },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.doneButtonText,
                { color: theme.primaryForeground },
              ]}
            >
              Done
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FilterOption({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: SymbolName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterOption,
        selected && { backgroundColor: `${theme.primary}12` },
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name={icon}
        size={19}
        tintColor={selected ? theme.primary : theme.tabIcon}
      />
      <Text
        style={[
          styles.filterOptionLabel,
          { color: selected ? theme.primary : theme.text },
        ]}
      >
        {label}
      </Text>
      {selected ? (
        <SymbolView
          name={sym("checkmark", "check")}
          size={14}
          weight="bold"
          tintColor={theme.primary}
        />
      ) : null}
    </Pressable>
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
  logsByHabitDate: Record<string, "complete" | "planned">;
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
          key={toDateKey(week.at(0)?.date ?? new Date(0))}
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
  logsByHabitDate: Record<string, "complete" | "planned">;
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
            const bg = status === "complete" ? theme.primary : "#A0A0A0";
            return (
              <View
                key={goal.id}
                style={[styles.iconTile, { backgroundColor: bg }]}
              >
                <GoalIcon iconKey={goal.iconKey} size={9} color="#FFFFFF" />
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
  periodicHabits,
  hasMonthlyGoals,
  isFilterActive,
  isFilterOpen,
  logsByHabitDate,
  updatingKeys,
  onDeleteGoal,
  onEditGoal,
  onOpenSortFilter,
  onPressGoal,
}: {
  selectedDate: Date;
  selectedDateKey: string;
  monthKey: string;
  periodicHabits: PeriodicHabitInfo[];
  hasMonthlyGoals: boolean;
  isFilterActive: boolean;
  isFilterOpen: boolean;
  logsByHabitDate: Record<string, "complete" | "planned">;
  updatingKeys: Set<string>;
  onDeleteGoal: (goal: PeriodicHabitInfo) => void;
  onEditGoal: (goal: PeriodicHabitInfo) => void;
  onOpenSortFilter: () => void;
  onPressGoal: (goal: PeriodicHabitInfo) => void;
}) {
  const theme = useTheme();

  if (!hasMonthlyGoals) {
    return (
      <View style={styles.emptyState}>
        <View
          style={[
            styles.emptyIcon,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <SymbolView
            name={sym("calendar", "calendar_today")}
            size={26}
            tintColor={theme.primary}
          />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          No monthly habits yet
        </Text>
        <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
          Add monthly habits from the Habits section to track them here.
        </Text>
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
            Tap a habit to update its report
          </Text>
        </View>
      </View>

      {/* Section label */}
      <View style={styles.sectionLabelRow}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          Monthly Habits
        </Text>
        <Pressable
          accessibilityLabel="Sort and filter monthly habits list"
          accessibilityRole="button"
          accessibilityState={{
            expanded: isFilterOpen,
            selected: isFilterActive,
          }}
          onPress={onOpenSortFilter}
          style={({ pressed }) => [
            styles.detailFilterButton,
            {
              backgroundColor: isFilterActive
                ? theme.primary
                : theme.backgroundElement,
            },
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={sym("line.3.horizontal.decrease", "filter_list")}
            size={16}
            weight="semibold"
            tintColor={
              isFilterActive ? theme.primaryForeground : theme.textSecondary
            }
          />
        </Pressable>
      </View>

      {/* Habit list */}
      <View
        style={[
          styles.goalList,
          {
            borderTopColor: theme.tabBorder,
            borderBottomColor: theme.tabBorder,
          },
        ]}
      >
        {periodicHabits.length > 0 ? (
          periodicHabits.map((goal, index) => (
            <View key={goal.id}>
              {index > 0 ? (
                <View
                  style={[styles.divider, { backgroundColor: theme.tabBorder }]}
                />
              ) : null}
              <SwipeableGoalRow
                goal={goal}
                logsByHabitDate={logsByHabitDate}
                monthKey={monthKey}
                status={logsByHabitDate[`${goal.id}_${selectedDateKey}`]}
                isUpdating={updatingKeys.has(`${goal.id}_${selectedDateKey}`)}
                onDelete={() => onDeleteGoal(goal)}
                onEdit={() => onEditGoal(goal)}
                onPress={() => onPressGoal(goal)}
              />
            </View>
          ))
        ) : (
          <View style={styles.filteredEmptyState}>
            <Text style={[styles.filteredEmptyTitle, { color: theme.text }]}>
              No habits match these filters
            </Text>
            <Text
              style={[
                styles.filteredEmptyDescription,
                { color: theme.textSecondary },
              ]}
            >
              Choose another category or reset the filter.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function SwipeableGoalRow({
  goal,
  logsByHabitDate,
  monthKey,
  status,
  isUpdating,
  onDelete,
  onEdit,
  onPress,
}: {
  goal: PeriodicHabitInfo;
  logsByHabitDate: Record<string, "complete" | "planned">;
  monthKey: string;
  status: "complete" | "planned" | undefined;
  isUpdating: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <ReanimatedSwipeable
      friction={1.5}
      overshootRight={false}
      rightThreshold={52}
      containerStyle={{ backgroundColor: theme.tabBar }}
      childrenContainerStyle={{ backgroundColor: theme.tabBar }}
      renderRightActions={(_progress, _translation, swipeableMethods) => (
        <GoalSwipeActions
          swipeableMethods={swipeableMethods}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      )}
    >
      <GoalListRow
        goal={goal}
        logsByHabitDate={logsByHabitDate}
        monthKey={monthKey}
        status={status}
        isUpdating={isUpdating}
        onEdit={onEdit}
        onPress={onPress}
      />
    </ReanimatedSwipeable>
  );
}

function GoalSwipeActions({
  swipeableMethods,
  onDelete,
  onEdit,
}: {
  swipeableMethods: SwipeableMethods;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme();

  const runAction = (action: () => void) => {
    swipeableMethods.close();
    action();
  };

  return (
    <View style={styles.swipeActions}>
      <Pressable
        accessibilityLabel="Edit habit"
        accessibilityRole="button"
        onPress={() => runAction(onEdit)}
        style={({ pressed }) => [
          styles.swipeAction,
          { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}
      >
        <SymbolView
          name={sym("pencil", "edit")}
          size={19}
          weight="semibold"
          tintColor={theme.primaryForeground}
        />
        <Text
          style={[styles.swipeActionLabel, { color: theme.primaryForeground }]}
        >
          Edit
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Delete habit"
        accessibilityRole="button"
        onPress={() => runAction(onDelete)}
        style={({ pressed }) => [
          styles.swipeAction,
          styles.deleteSwipeAction,
          pressed && styles.pressed,
        ]}
      >
        <SymbolView
          name={sym("trash", "delete")}
          size={19}
          weight="semibold"
          tintColor="#FFFFFF"
        />
        <Text style={[styles.swipeActionLabel, styles.deleteSwipeActionLabel]}>
          Delete
        </Text>
      </Pressable>
    </View>
  );
}

function GoalListRow({
  goal,
  logsByHabitDate,
  monthKey,
  status,
  isUpdating,
  onEdit,
  onPress,
}: {
  goal: PeriodicHabitInfo;
  logsByHabitDate: Record<string, "complete" | "planned">;
  monthKey: string;
  status: "complete" | "planned" | undefined;
  isUpdating: boolean;
  onEdit: () => void;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isComplete = status === "complete";
  const isPlanned = status === "planned";
  const { completed, planned, target } = getGoalMonthProgress(
    goal,
    monthKey,
    logsByHabitDate,
  );
  const completedSlots = Math.min(completed, target);
  const plannedSlots = Math.min(planned, Math.max(target - completedSlots, 0));
  const completedWidth = `${(completedSlots / target) * 100}%` as const;
  const plannedWidth = `${(plannedSlots / target) * 100}%` as const;

  const rowBg = isComplete
    ? `${theme.primary}12`
    : isPlanned
      ? "#A0A0A00E"
      : "transparent";
  const statusBg = isComplete
    ? theme.primary
    : isPlanned
      ? "#A0A0A0"
      : "transparent";
  const statusBorder = isComplete
    ? theme.primary
    : isPlanned
      ? "#A0A0A0"
      : theme.tabBorder;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${completed} of ${target} complete this month, ${planned} planned. ${status ?? "Not reported"} for the selected day. Tap to open actions.`}
      style={({ pressed }) => [
        styles.goalRow,
        { backgroundColor: rowBg },
        pressed && styles.pressed,
      ]}
    >
      {/* Status box */}
      <View
        style={[
          styles.statusBox,
          { backgroundColor: statusBg, borderColor: statusBorder },
        ]}
      >
        {isUpdating ? (
          <ActivityIndicator
            size="small"
            color={isComplete || isPlanned ? "#FFFFFF" : theme.primary}
          />
        ) : isComplete ? (
          <SymbolView
            name={sym("checkmark", "check")}
            size={13}
            weight="bold"
            tintColor="#FFFFFF"
          />
        ) : isPlanned ? (
          <SymbolView
            name={sym("clock", "schedule")}
            size={13}
            weight="semibold"
            tintColor="#FFFFFF"
          />
        ) : null}
      </View>

      {/* Habit icon */}
      <View
        style={[styles.goalIcon, { backgroundColor: theme.backgroundElement }]}
      >
        <GoalIcon
          iconKey={goal.iconKey}
          size={17}
          color={isComplete ? theme.primary : theme.tabIcon}
        />
      </View>

      {/* Name + monthly progress */}
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
        <View
          accessibilityLabel={`${completed} of ${target} complete, ${planned} planned this month`}
          accessibilityRole="progressbar"
          accessibilityValue={{
            max: target,
            min: 0,
            now: Math.min(completed, target),
          }}
          style={[
            styles.goalProgressTrack,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          {completedSlots > 0 ? (
            <View
              style={[styles.goalProgressCompleted, { width: completedWidth }]}
            />
          ) : null}
          {plannedSlots > 0 ? (
            <View style={[styles.goalProgressPlanned, { width: plannedWidth }]}>
              <View style={styles.plannedStripeRow}>
                {PLANNED_STRIPES.map((stripe) => (
                  <View key={stripe} style={styles.plannedStripe} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {/* Edit menu */}
      <Pressable
        accessibilityLabel={`Edit ${goal.name}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        style={({ pressed }) => [
          styles.goalMenuButton,
          { backgroundColor: theme.backgroundElement },
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

function GoalActionsModal({
  goal,
  visible,
  hasNote,
  hasPhoto,
  plannedTime,
  visibility,
  status,
  isUpdating,
  isUpdatingVisibility,
  selectedDateKey,
  todayDateKey,
  uploadingPhotoSource,
  onAddPhoto,
  onOpenNote,
  onSetVisibility,
  onSetStatus,
  onDismiss,
}: {
  goal: PeriodicHabitInfo | null;
  visible: boolean;
  hasNote: boolean;
  hasPhoto: boolean;
  plannedTime?: { startTime: string | null; endTime: string | null };
  visibility: HabitVisibility;
  status: "complete" | "planned" | undefined;
  isUpdating: boolean;
  isUpdatingVisibility: boolean;
  selectedDateKey: string;
  todayDateKey: string;
  uploadingPhotoSource: GoalPhotoSource | null;
  onAddPhoto: (source: GoalPhotoSource) => void;
  onOpenNote: () => void;
  onSetVisibility: (visibility: HabitVisibility) => void;
  onSetStatus: (
    status: HabitLogStatus,
    options?: {
      endTime?: string | null;
      startTime?: string | null;
      timeZone?: string | null;
    },
  ) => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const isComplete = status === "complete";
  const isPlanned = status === "planned";
  const isPast = selectedDateKey < todayDateKey;
  const isFuture = selectedDateKey > todayDateKey;
  const showCompleteAction = !isFuture || isComplete;
  const showPlanAction = !isPast && !isComplete;
  const isUploadingPhoto = uploadingPhotoSource !== null;
  const [planStartTime, setPlanStartTime] = useState("");
  const [planEndTime, setPlanEndTime] = useState("");

  useEffect(() => {
    if (!visible) return;
    setPlanStartTime(plannedTime?.startTime ?? "");
    setPlanEndTime(plannedTime?.endTime ?? "");
  }, [plannedTime?.endTime, plannedTime?.startTime, visible]);

  return (
    <Modal
      animationType="slide"
      transparent
      statusBarTranslucent
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={modalStyles.overlay}>
        <Pressable
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[modalStyles.sheet, { backgroundColor: theme.background }]}
        >
          {goal ? (
            <>
              <View
                style={[
                  modalStyles.header,
                  {
                    backgroundColor: theme.tabBar,
                    borderBottomColor: theme.tabBorder,
                  },
                ]}
              >
                <Text
                  style={[modalStyles.title, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {goal.name}
                </Text>
                <Pressable
                  onPress={onDismiss}
                  hitSlop={8}
                  style={({ pressed }) => [
                    modalStyles.closeBtn,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("xmark", "close")}
                    size={14}
                    weight="bold"
                    tintColor={theme.tabIcon}
                  />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={modalStyles.actions}
                showsVerticalScrollIndicator={false}
              >
                {showCompleteAction ? (
                  <Pressable
                    onPress={() => onSetStatus(isComplete ? null : "complete")}
                    style={({ pressed }) => [
                      modalStyles.actionRow,
                      { backgroundColor: theme.backgroundElement },
                      pressed && styles.pressed,
                    ]}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <SymbolView
                        name={
                          isComplete
                            ? sym("arrow.uturn.backward.circle.fill", "undo")
                            : sym("checkmark.circle.fill", "check_circle")
                        }
                        size={26}
                        tintColor={
                          isComplete ? theme.textSecondary : theme.primary
                        }
                      />
                    )}
                    <Text
                      style={[modalStyles.actionText, { color: theme.text }]}
                    >
                      {isComplete ? "Reopen" : "Mark complete"}
                    </Text>
                  </Pressable>
                ) : null}

                {showPlanAction ? (
                  <>
                    <Pressable
                      onPress={() =>
                        onSetStatus(isPlanned ? null : "planned", {
                          startTime: planStartTime.trim() || null,
                          endTime: planEndTime.trim() || null,
                          timeZone: getLocalTimeZone(),
                        })
                      }
                      style={({ pressed }) => [
                        modalStyles.actionRow,
                        { backgroundColor: theme.backgroundElement },
                        pressed && styles.pressed,
                      ]}
                    >
                      {isUpdating ? (
                        <ActivityIndicator size="small" color="#A0A0A0" />
                      ) : (
                        <SymbolView
                          name={
                            isPlanned
                              ? sym("calendar.badge.minus", "event_busy")
                              : sym("calendar.badge.plus", "event_available")
                          }
                          size={26}
                          tintColor={
                            isPlanned ? theme.textSecondary : "#A0A0A0"
                          }
                        />
                      )}
                      <Text
                        style={[modalStyles.actionText, { color: theme.text }]}
                      >
                        {isPlanned ? "Remove plan" : "Plan"}
                      </Text>
                    </Pressable>

                    <View
                      style={[
                        modalStyles.planTimeSection,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <Text
                        style={[
                          modalStyles.planTimeSectionTitle,
                          { color: theme.text },
                        ]}
                      >
                        Time range
                      </Text>
                      <View style={modalStyles.planTimeFields}>
                        <View style={modalStyles.planTimeField}>
                          <Text
                            style={[
                              modalStyles.planTimeLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            Start
                          </Text>
                          <TextInput
                            autoCapitalize="none"
                            keyboardType="numbers-and-punctuation"
                            onChangeText={setPlanStartTime}
                            placeholder="09:00"
                            placeholderTextColor={theme.textSecondary}
                            selectionColor={theme.primary}
                            style={[
                              modalStyles.planTimeInput,
                              {
                                borderColor: theme.tabBorder,
                                color: theme.text,
                              },
                            ]}
                            value={planStartTime}
                          />
                        </View>
                        <View style={modalStyles.planTimeField}>
                          <Text
                            style={[
                              modalStyles.planTimeLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            End
                          </Text>
                          <TextInput
                            autoCapitalize="none"
                            keyboardType="numbers-and-punctuation"
                            onChangeText={setPlanEndTime}
                            placeholder="10:00"
                            placeholderTextColor={theme.textSecondary}
                            selectionColor={theme.primary}
                            style={[
                              modalStyles.planTimeInput,
                              {
                                borderColor: theme.tabBorder,
                                color: theme.text,
                              },
                            ]}
                            value={planEndTime}
                          />
                        </View>
                      </View>
                    </View>
                  </>
                ) : null}

                {/* Add note */}
                <Pressable
                  onPress={onOpenNote}
                  style={({ pressed }) => [
                    modalStyles.actionRow,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("note.text", "notes")}
                    size={26}
                    tintColor={theme.primary}
                  />
                  <Text style={[modalStyles.actionText, { color: theme.text }]}>
                    {hasNote ? "Edit note" : "Add note"}
                  </Text>
                </Pressable>

                {hasNote || hasPhoto ? (
                  <GoalLogVisibilityControl
                    disabled={isUpdatingVisibility}
                    value={visibility}
                    onChange={onSetVisibility}
                  />
                ) : null}

                {/* Photo row */}
                <View style={modalStyles.photoRow}>
                  <Pressable
                    disabled={isUploadingPhoto}
                    onPress={() => onAddPhoto("camera")}
                    style={({ pressed }) => [
                      modalStyles.photoBtn,
                      { backgroundColor: theme.backgroundElement },
                      isUploadingPhoto && modalStyles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {uploadingPhotoSource === "camera" ? (
                      <ActivityIndicator color={theme.primary} size="small" />
                    ) : (
                      <SymbolView
                        name={sym("camera.fill", "camera_alt")}
                        size={26}
                        tintColor={theme.primary}
                      />
                    )}
                    <Text
                      style={[modalStyles.actionText, { color: theme.text }]}
                    >
                      Take photo
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={isUploadingPhoto}
                    onPress={() => onAddPhoto("library")}
                    style={({ pressed }) => [
                      modalStyles.photoBtn,
                      { backgroundColor: theme.backgroundElement },
                      isUploadingPhoto && modalStyles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {uploadingPhotoSource === "library" ? (
                      <ActivityIndicator color={theme.primary} size="small" />
                    ) : (
                      <SymbolView
                        name={sym("photo.fill", "photo_library")}
                        size={26}
                        tintColor={theme.primary}
                      />
                    )}
                    <Text
                      style={[modalStyles.actionText, { color: theme.text }]}
                    >
                      Add photo
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
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
    backgroundColor: "#2C5352",
  },
  goalProgressPlanned: {
    height: "100%",
    overflow: "hidden",
    backgroundColor: "#2C5352",
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
    backgroundColor: "#A0A0A0",
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

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000055",
  },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    gap: 10,
    padding: 16,
    paddingBottom: 32,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    minHeight: 64,
  },
  actionText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
  },
  planTimeSection: {
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  planTimeSectionTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  planTimeFields: {
    flexDirection: "row",
    gap: 10,
  },
  planTimeField: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  planTimeLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  planTimeInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "700",
  },
  photoRow: {
    flexDirection: "row",
    gap: 6,
  },
  photoBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
  },
  disabled: { opacity: 0.55 },
});
