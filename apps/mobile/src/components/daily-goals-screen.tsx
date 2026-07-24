import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  type GestureResponderEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CelebrationOverlay,
  confettiSource,
  fireSource,
} from "@/components/celebration-overlay";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { HabitFormModal } from "@/components/habits-manager-screen";
import { HabitsTabs } from "@/components/habits-tabs";
import { PlanReportHeaderMenu } from "@/components/plan-report-header-menu";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  addCrashBreadcrumb,
  captureHandledError,
  setCrashContext,
} from "@/lib/crash-reporting";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import { uploadGoalPhoto } from "@/lib/goal-photos-client";
import {
  type HabitInCategory,
  type HabitLogStatus,
  type HabitLogsSnapshot,
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
  fetchCategories,
  updateHabit,
} from "@/lib/habits-client";
import { scheduleHabitReminderAsync } from "@/lib/push-notifications";
import type { HabitsTab } from "@/lib/tab-view-store";

import { CategoryAccordionRow } from "./daily-goals/category-accordion-row";
import { CompletedSection } from "./daily-goals/completed-section";
import { EmptyState } from "./daily-goals/empty-state";
import { GoalActionsModal } from "./daily-goals/goal-actions-modal";
import { GoalRow } from "./daily-goals/goal-row";
import { PriorityAccordion } from "./daily-goals/priority-accordion";
import {
  type ActionGoal,
  PRIORITY_LABELS,
  addDays,
  formatDate,
  getGoalDateStatus,
  isSameDay,
  styles,
  sym,
} from "./daily-goals/shared";

const DAY_SWIPE_MIN_DISTANCE = 70;
const DAY_CHANGE_ANIMATION_DISTANCE = 28;

export function DailyGoalsScreen({
  initialDateKey,
  habitsTab,
  onDateChange,
  onHabitsTabChange,
}: {
  initialDateKey?: string;
  habitsTab?: HabitsTab;
  onDateChange?: (dateKey: string) => void;
  onHabitsTabChange?: (tab: HabitsTab) => void;
}) {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey)) {
      const [y, m, d] = initialDateKey.split("-").map(Number);
      return new Date(y, (m as number) - 1, d as number);
    }
    return new Date();
  });
  const [snapshot, setSnapshot] = useState<HabitLogsSnapshot | null>(null);
  const [logsByHabitDate, setLogsByGoalDate] = useState<
    HabitLogsSnapshot["logsByHabitDate"]
  >({});
  const [completedCountsByHabitDate, setCompletedCountsByHabitDate] = useState<
    HabitLogsSnapshot["completedCountsByHabitDate"]
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());
  const [openPriorities, setOpenPriorities] = useState<Set<string>>(
    () => new Set(["high"]),
  );
  const [expandedCatKeys, setExpandedCatKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeGoal, setActiveGoal] = useState<ActionGoal | null>(null);
  const [noteGoal, setNoteGoal] = useState<ActionGoal | null>(null);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Habit | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const [fireCelebrate, setFireCelebrate] = useState(false);
  const daySwipeRef = useRef<{
    pageX: number;
    pageY: number;
  } | null>(null);
  const dateMotionValueRef = useRef(new Animated.Value(0));
  const dateMotionDirectionRef = useRef(1);
  const didMountDateMotionRef = useRef(false);
  const allHighDoneRef = useRef(false);
  const hasObservedHighDoneRef = useRef(false);
  const highGoalIdsRef = useRef<Set<string>>(new Set());
  const highProgressRef = useRef({ completed: 0, total: 0 });
  const updatingKeysRef = useRef(updatingKeys);
  updatingKeysRef.current = updatingKeys;
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);

  const monthKey = useMemo(() => getMonthKey(selectedDate), [selectedDate]);
  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute "today" when the selected date changes (e.g. across midnight)
  const today = useMemo(() => new Date(), [dateKey]);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const isToday = isSameDay(selectedDate, today);
  const isFutureDate = dateKey > todayKey;

  useEffect(() => {
    onDateChange?.(dateKey);
  }, [dateKey, onDateChange]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: animate whenever the selected date key changes.
  useEffect(() => {
    if (!didMountDateMotionRef.current) {
      didMountDateMotionRef.current = true;
      return;
    }

    const motion = dateMotionValueRef.current;
    motion.setValue(
      dateMotionDirectionRef.current * DAY_CHANGE_ANIMATION_DISTANCE,
    );
    Animated.timing(motion, {
      duration: 180,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [dateKey]);

  const dateMotionStyle = useMemo(
    () => ({
      opacity: dateMotionValueRef.current.interpolate({
        inputRange: [
          -DAY_CHANGE_ANIMATION_DISTANCE,
          0,
          DAY_CHANGE_ANIMATION_DISTANCE,
        ],
        outputRange: [0.82, 1, 0.82],
      }),
      transform: [{ translateX: dateMotionValueRef.current }],
    }),
    [],
  );

  const moveDate = useCallback((days: number) => {
    dateMotionDirectionRef.current = days > 0 ? 1 : -1;
    setSelectedDate((current) => addDays(current, days));
  }, []);

  const goToToday = useCallback(() => {
    const nextToday = new Date(today);
    dateMotionDirectionRef.current = nextToday > selectedDate ? 1 : -1;
    setSelectedDate(nextToday);
  }, [selectedDate, today]);

  const cancelDaySwipe = useCallback(() => {
    daySwipeRef.current = null;
  }, []);

  const handleDaySwipeStart = useCallback(
    (event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length !== 1) {
        cancelDaySwipe();
        return;
      }

      const touch = event.nativeEvent.touches[0];
      daySwipeRef.current = { pageX: touch.pageX, pageY: touch.pageY };
    },
    [cancelDaySwipe],
  );

  const handleDaySwipeEnd = useCallback(
    (event: GestureResponderEvent) => {
      const start = daySwipeRef.current;
      cancelDaySwipe();
      if (!start) return;

      const touch = event.nativeEvent.changedTouches[0];
      if (!touch) return;

      const dx = touch.pageX - start.pageX;
      const dy = touch.pageY - start.pageY;
      if (
        Math.abs(dx) >= DAY_SWIPE_MIN_DISTANCE &&
        Math.abs(dx) > Math.abs(dy) * 1.35
      ) {
        moveDate(dx > 0 ? -1 : 1);
      }
    },
    [cancelDaySwipe, moveDate],
  );

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
        setCompletedCountsByHabitDate(snap.completedCountsByHabitDate);
        setCategories(cats);
      } catch (err) {
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }
        captureHandledError(err, { handler: "load", monthKey });
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

  useEffect(() => {
    void load();
  }, [load]);

  const saveGoal = async (input: HabitInput) => {
    addCrashBreadcrumb("saveGoal", { editing: Boolean(editingGoal) });
    try {
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
    } catch (err) {
      captureHandledError(err, { handler: "saveGoal" });
      throw err;
    }
  };

  const addCategory = async (name: string, icon: string): Promise<Category> => {
    const category = await createCategory({ name, icon });
    setCategories((current) => [...current, category]);
    return category;
  };

  const openEditGoal = (goal: HabitInCategory) => {
    addCrashBreadcrumb("openEditGoal", { goalId: goal.id });
    const category = categories.find((item) => item.id === goal.categoryId);
    setEditingGoal({
      ...goal,
      categoryName: category?.name ?? "",
      categoryIcon: category?.icon ?? "",
      goalId: goal.goalId,
      goalTitle: goal.goalTitle,
      repeatInterval: null,
      repeatDays: null,
      repeatMonthlyType: null,
      createdAt: "",
      updatedAt: "",
    });
    setFormOpen(true);
  };

  const handleSetStatus = useCallback(
    async (
      goalId: string,
      status: HabitLogStatus,
      options?: {
        endTime?: string | null;
        repeatPlan?: boolean;
        startTime?: string | null;
        timeZone?: string | null;
        completedCount?: number;
      },
    ) => {
      const key = `${goalId}_${dateKey}`;
      addCrashBreadcrumb("handleSetStatus", {
        dateKey,
        goalId,
        status: status ?? "clear",
      });
      if (updatingKeysRef.current.has(key)) return;
      const current = logsByHabitDate[key];
      const currentCount = completedCountsByHabitDate[key] ?? 0;

      // Completing the last remaining high-priority habit triggers the fire
      // celebration instead, so suppress confetti for that final completion.
      const high = highProgressRef.current;
      const willFinishAllHigh =
        highGoalIdsRef.current.has(goalId) &&
        high.total > 0 &&
        high.completed + 1 >= high.total;
      if (
        status === "complete" &&
        current !== "complete" &&
        !willFinishAllHigh
      ) {
        setCelebrate(true);
      }

      setUpdatingKeys((prev) => new Set(prev).add(key));
      setLogsByGoalDate((prev) => {
        const updated = { ...prev };
        if (status) updated[key] = status;
        else delete updated[key];
        return updated;
      });
      setCompletedCountsByHabitDate((prev) => {
        const updated = { ...prev };
        const nextCount =
          options?.completedCount ?? (status === "complete" ? 1 : 0);
        if (nextCount > 0) updated[key] = nextCount;
        else delete updated[key];
        return updated;
      });

      try {
        await setHabitLog(goalId, dateKey, status, options);
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

          const completedCountsByHabitDate = {
            ...(currentSnapshot.completedCountsByHabitDate ?? {}),
          };
          const nextCount =
            options?.completedCount ?? (status === "complete" ? 1 : 0);
          if (nextCount > 0) completedCountsByHabitDate[key] = nextCount;
          else delete completedCountsByHabitDate[key];

          return {
            ...currentSnapshot,
            completedCountsByHabitDate,
            plannedTimesByHabitDate,
          };
        });
      } catch (err) {
        captureHandledError(err, {
          dateKey,
          goalId,
          handler: "handleSetStatus",
        });
        setLogsByGoalDate((prev) => {
          const reverted = { ...prev };
          if (current) reverted[key] = current;
          else delete reverted[key];
          return reverted;
        });
        setCompletedCountsByHabitDate((prev) => {
          const reverted = { ...prev };
          if (currentCount > 0) reverted[key] = currentCount;
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
    [completedCountsByHabitDate, dateKey, logsByHabitDate],
  );

  const handleSaveNote = useCallback(
    async (goalId: string, notes: string) => {
      addCrashBreadcrumb("handleSaveNote", { dateKey, goalId });
      try {
        await setHabitLogNote(goalId, dateKey, notes);
        const snap = await fetchHabitLogsSnapshot(monthKey);
        setSnapshot(snap);
        setLogsByGoalDate(snap.logsByHabitDate);
        setCompletedCountsByHabitDate(snap.completedCountsByHabitDate);
      } catch (err) {
        captureHandledError(err, {
          dateKey,
          goalId,
          handler: "handleSaveNote",
        });
        throw err;
      }
    },
    [dateKey, monthKey],
  );

  const handleAddPhoto = useCallback(
    async (goalId: string, source: GoalPhotoSource) => {
      addCrashBreadcrumb("handleAddPhoto", { dateKey, goalId, source });
      if (uploadingPhotoSource) return;
      setUploadingPhotoSource(source);

      try {
        const photo = await pickGoalPhoto(source);
        if (!photo) return;

        await uploadGoalPhoto(goalId, dateKey, photo);
        const snap = await fetchHabitLogsSnapshot(monthKey);
        setSnapshot(snap);
        setLogsByGoalDate(snap.logsByHabitDate);
        setCompletedCountsByHabitDate(snap.completedCountsByHabitDate);
      } catch (photoError) {
        captureHandledError(photoError, {
          dateKey,
          goalId,
          handler: "handleAddPhoto",
          source,
        });
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
    [dateKey, monthKey, uploadingPhotoSource],
  );

  const handleSetVisibility = useCallback(
    async (goalId: string, visibility: HabitVisibility) => {
      addCrashBreadcrumb("handleSetVisibility", {
        dateKey,
        goalId,
        visibility,
      });
      if (isUpdatingVisibility) return;
      const key = `${goalId}_${dateKey}`;
      setIsUpdatingVisibility(true);

      try {
        await setHabitLogVisibility(goalId, dateKey, visibility);
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
        captureHandledError(visibilityError, {
          dateKey,
          goalId,
          handler: "handleSetVisibility",
        });
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
    [dateKey, isUpdatingVisibility],
  );

  const categoriesWithGoals = useMemo(
    () => snapshot?.categories.filter((cat) => cat.habits.length > 0) ?? [],
    [snapshot],
  );

  // Habits tied to a shared goal or accepted incentive stay in their category,
  // but still count as high priority for the daily focus flow.
  const incentiveGoalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const inc of snapshot?.acceptedHabitIncentives ?? []) {
      ids.add(inc.habitId);
    }
    return ids;
  }, [snapshot]);

  const isSharedOrIncentive = useCallback(
    (goal: HabitInCategory) =>
      (goal.sharedGoals?.length ?? 0) > 0 || incentiveGoalIds.has(goal.id),
    [incentiveGoalIds],
  );
  const getDailyPriorityBucket = useCallback(
    (goal: HabitInCategory): "high" | "low" =>
      isSharedOrIncentive(goal) || goal.priority === "high" ? "high" : "low",
    [isSharedOrIncentive],
  );

  const priorityProgress = useMemo(() => {
    const progress = {
      high: { completed: 0, total: 0 },
      low: { completed: 0, total: 0 },
    };

    for (const cat of categoriesWithGoals) {
      for (const goal of cat.habits) {
        const pr = getDailyPriorityBucket(goal);
        progress[pr].total++;
        if (getGoalDateStatus(goal, dateKey, logsByHabitDate) === "complete") {
          progress[pr].completed++;
        }
      }
    }

    return progress;
  }, [categoriesWithGoals, dateKey, logsByHabitDate, getDailyPriorityBucket]);

  const highGoalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cat of categoriesWithGoals) {
      for (const goal of cat.habits) {
        if (getDailyPriorityBucket(goal) === "high") {
          ids.add(goal.id);
        }
      }
    }
    return ids;
  }, [categoriesWithGoals, getDailyPriorityBucket]);
  highGoalIdsRef.current = highGoalIds;
  highProgressRef.current = priorityProgress.high;

  // Fire celebration when the last remaining high-priority habit is completed.
  // Tracks the previous "all done" state so it only triggers on the transition,
  // not on every render while everything stays complete.
  useEffect(() => {
    const { completed, total } = priorityProgress.high;
    const allHighDone = total > 0 && completed === total;
    if (
      hasObservedHighDoneRef.current &&
      allHighDone &&
      !allHighDoneRef.current
    ) {
      setFireCelebrate(true);
    }
    hasObservedHighDoneRef.current = true;
    allHighDoneRef.current = allHighDone;
  }, [priorityProgress]);

  const monthlyPlannedGoals = useMemo(
    () =>
      snapshot?.periodicHabits.filter((goal) => {
        const status = logsByHabitDate[`${goal.id}_${dateKey}`];
        return status === "planned" || status === "complete";
      }) ?? [],
    [dateKey, logsByHabitDate, snapshot],
  );
  const monthlyPlannedCompleted = useMemo(
    () =>
      monthlyPlannedGoals.filter(
        (goal) => logsByHabitDate[`${goal.id}_${dateKey}`] === "complete",
      ).length,
    [dateKey, logsByHabitDate, monthlyPlannedGoals],
  );

  const monthlyActionGoals = useMemo(
    () =>
      monthlyPlannedGoals.map<ActionGoal>((goal) => ({
        ...goal,
        hidden: false,
      })),
    [monthlyPlannedGoals],
  );

  // Habits grouped by priority, excluding completed habits. Shared/incentive
  // habits stay in their actual category; only auto-created "Shared Goals"
  // category habits show in that section.
  const priorityGroups = useMemo(() => {
    const make = (p: "high" | "low") =>
      categoriesWithGoals
        .map((cat) => ({
          category: cat,
          goals: cat.habits.filter(
            (g) =>
              getDailyPriorityBucket(g) === p &&
              getGoalDateStatus(g, dateKey, logsByHabitDate) !== "complete",
          ),
        }))
        .filter((g) => g.goals.length > 0);

    return { high: make("high"), low: make("low") };
  }, [categoriesWithGoals, logsByHabitDate, dateKey, getDailyPriorityBucket]);

  // All completed habits for this date
  const completedList = useMemo(
    () =>
      categoriesWithGoals.flatMap((cat) =>
        cat.habits
          .filter(
            (g) =>
              getGoalDateStatus(g, dateKey, logsByHabitDate) === "complete",
          )
          .map((g) => ({ goal: g, category: cat })),
      ),
    [categoriesWithGoals, logsByHabitDate, dateKey],
  );

  const togglePriority = useCallback((p: string) => {
    setOpenPriorities((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }, []);

  const toggleCatKey = useCallback((key: string) => {
    setExpandedCatKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const openGoalActions = useCallback(
    (goal: ActionGoal) => {
      setCrashContext("goal_actions_modal", {
        dateKey,
        goalId: goal.id,
        period: goal.period,
        phase: "tap-received",
      });
      addCrashBreadcrumb("Opening goal actions", {
        dateKey,
        goalId: goal.id,
        period: goal.period,
      });
      setActiveGoal(goal);
    },
    [dateKey],
  );

  const handleGoalActionsShown = useCallback(
    (goal: ActionGoal) => {
      setCrashContext("goal_actions_modal", {
        dateKey,
        goalId: goal.id,
        period: goal.period,
        phase: "native-on-show",
      });
      addCrashBreadcrumb("Goal actions modal shown", {
        goalId: goal.id,
        period: goal.period,
      });
    },
    [dateKey],
  );

  const handleGoalActionsDismiss = useCallback(
    (goal: ActionGoal, reason: string) => {
      setCrashContext("goal_actions_modal", {
        dateKey,
        goalId: goal.id,
        period: goal.period,
        phase: `dismissed:${reason}`,
      });
      addCrashBreadcrumb("Goal actions modal dismissed", {
        goalId: goal.id,
        period: goal.period,
        reason,
      });
      setActiveGoal(null);
    },
    [dateKey],
  );

  // Defensive, self-reporting derivation of the goal-actions modal props. Every
  // snapshot sub-map and goal field is optional-chained with a fallback so a
  // malformed/incomplete goal (e.g. missing period/visibility from the API)
  // can't throw during render. If it somehow still does, we capture exactly
  // which goal shape caused it instead of an opaque "convert undefined" crash.
  let modalProps: {
    hasNote: boolean;
    noteText: string | null;
    hasPhoto: boolean;
    plannedTime: { startTime: string | null; endTime: string | null } | null;
    visibility: HabitVisibility;
    status: Exclude<HabitLogStatus, null> | undefined;
    completedCount: number;
    isUpdating: boolean;
  } = {
    hasNote: false,
    noteText: null,
    hasPhoto: false,
    plannedTime: null,
    visibility: "only_me",
    status: undefined,
    completedCount: 0,
    isUpdating: false,
  };
  if (activeGoal) {
    try {
      const key = `${activeGoal.id}_${dateKey}`;
      modalProps = {
        hasNote: Boolean(snapshot?.notesByHabitDate?.[key]?.trim()),
        noteText: snapshot?.notesByHabitDate?.[key] ?? null,
        hasPhoto: (snapshot?.photoCountsByHabitDate?.[key] ?? 0) > 0,
        plannedTime: snapshot?.plannedTimesByHabitDate?.[key] ?? null,
        visibility:
          snapshot?.visibilityByHabitDate?.[key] ??
          activeGoal.visibility ??
          "only_me",
        status: getGoalDateStatus(activeGoal, dateKey, logsByHabitDate),
        completedCount: completedCountsByHabitDate[key] ?? 0,
        isUpdating: updatingKeys.has(key),
      };
    } catch (modalError) {
      captureHandledError(modalError, {
        dateKey,
        goalId: activeGoal.id,
        goalKeys: Object.keys(activeGoal).join(","),
        hasNotesMap: Boolean(snapshot?.notesByHabitDate),
        hasPhotoMap: Boolean(snapshot?.photoCountsByHabitDate),
        hasSnapshot: Boolean(snapshot),
        hasVisibilityMap: Boolean(snapshot?.visibilityByHabitDate),
        phase: "compute-modal-props",
      });
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          canCancelContentTouches={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          onTouchCancel={cancelDaySwipe}
          onTouchEnd={handleDaySwipeEnd}
          onTouchStart={handleDaySwipeStart}
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
            <View style={styles.pageHeaderText}>
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

          {/* Date navigator */}
          <View
            style={[
              styles.dateNav,
              { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
            ]}
          >
            <Pressable
              accessibilityLabel="Previous day"
              hitSlop={8}
              onPress={() => moveDate(-1)}
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

            <View style={styles.dateLabel}>
              <Text style={[styles.dateLabelText, { color: theme.text }]}>
                {formatDate(selectedDate)}
              </Text>
              {isToday ? (
                <View
                  style={[
                    styles.todayBadge,
                    { backgroundColor: theme.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.todayBadgeText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    Today
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.navRight}>
              {!isToday ? (
                <Pressable
                  accessibilityLabel="Go to today"
                  onPress={goToToday}
                  style={({ pressed }) => [
                    styles.todayButton,
                    { borderColor: theme.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.todayButtonText, { color: theme.primary }]}
                  >
                    Today
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel="Next day"
                hitSlop={8}
                onPress={() => moveDate(1)}
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

          <Animated.View style={[{ gap: 14 }, dateMotionStyle]}>
            {/* Error */}
            {error ? (
              <View style={styles.errorBanner}>
                <SymbolView
                  name={sym("exclamationmark.circle.fill", "error")}
                  size={18}
                  tintColor="#9D474D"
                />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => void load()}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Content */}
            {isLoading ? (
              <View style={styles.centerState}>
                <FloatingLogoLoader />
              </View>
            ) : categoriesWithGoals.length === 0 &&
              monthlyPlannedGoals.length === 0 ? (
              <EmptyState />
            ) : (
              <View style={styles.prioritySections}>
                {(["high"] as const).map((p) => {
                  const groups = priorityGroups[p];
                  const progress = priorityProgress[p];
                  if (progress.total === 0) return null;
                  const isOpen = openPriorities.has(p);
                  return (
                    <PriorityAccordion
                      color={theme.primary}
                      completed={progress.completed}
                      key={p}
                      label={PRIORITY_LABELS[p] ?? p}
                      isOpen={isOpen}
                      total={progress.total}
                      onToggle={() => togglePriority(p)}
                    >
                      {groups.map(({ category, goals }) => {
                        const catKey = `${p}_${category.id}`;
                        const isExpanded = expandedCatKeys.has(catKey);
                        return (
                          <CategoryAccordionRow
                            key={catKey}
                            category={category}
                            goals={goals}
                            dateKey={dateKey}
                            logsByGoalDate={logsByHabitDate}
                            completedCountsByGoalDate={
                              completedCountsByHabitDate
                            }
                            plannedTimesByGoalDate={
                              snapshot?.plannedTimesByHabitDate
                            }
                            updatingKeys={updatingKeys}
                            isExpanded={isExpanded}
                            onToggleExpand={() => toggleCatKey(catKey)}
                            onEditGoal={openEditGoal}
                            onPressGoal={openGoalActions}
                          />
                        );
                      })}
                    </PriorityAccordion>
                  );
                })}
                {monthlyPlannedGoals.length > 0 ? (
                  <PriorityAccordion
                    color={theme.primary}
                    completed={monthlyPlannedCompleted}
                    isOpen={openPriorities.has("monthly")}
                    label="Periodic Habits"
                    total={monthlyPlannedGoals.length}
                    onToggle={() => togglePriority("monthly")}
                  >
                    <View
                      style={[
                        styles.goalSurface,
                        {
                          backgroundColor: theme.tabBar,
                          borderColor: theme.tabBorder,
                        },
                      ]}
                    >
                      {monthlyActionGoals.map((goal, index) => (
                        <View key={goal.id}>
                          {index > 0 ? (
                            <View
                              style={[
                                styles.divider,
                                { backgroundColor: theme.tabBorder },
                              ]}
                            />
                          ) : null}
                          <GoalRow
                            goal={goal}
                            status={logsByHabitDate[`${goal.id}_${dateKey}`]}
                            completedCount={
                              completedCountsByHabitDate[
                                `${goal.id}_${dateKey}`
                              ] ?? 0
                            }
                            plannedTime={
                              snapshot?.plannedTimesByHabitDate?.[
                                `${goal.id}_${dateKey}`
                              ] ?? null
                            }
                            isUpdating={updatingKeys.has(
                              `${goal.id}_${dateKey}`,
                            )}
                            onPress={() => openGoalActions(goal)}
                          />
                        </View>
                      ))}
                    </View>
                  </PriorityAccordion>
                ) : null}
                {(["low"] as const).map((p) => {
                  const groups = priorityGroups[p];
                  const progress = priorityProgress[p];
                  if (progress.total === 0) return null;
                  const isOpen = openPriorities.has(p);
                  return (
                    <PriorityAccordion
                      color={theme.primary}
                      completed={progress.completed}
                      key={p}
                      label={PRIORITY_LABELS[p] ?? p}
                      isOpen={isOpen}
                      total={progress.total}
                      onToggle={() => togglePriority(p)}
                    >
                      {groups.map(({ category, goals }) => {
                        const catKey = `${p}_${category.id}`;
                        const isExpanded = expandedCatKeys.has(catKey);
                        return (
                          <CategoryAccordionRow
                            key={catKey}
                            category={category}
                            goals={goals}
                            dateKey={dateKey}
                            logsByGoalDate={logsByHabitDate}
                            completedCountsByGoalDate={
                              completedCountsByHabitDate
                            }
                            plannedTimesByGoalDate={
                              snapshot?.plannedTimesByHabitDate
                            }
                            updatingKeys={updatingKeys}
                            isExpanded={isExpanded}
                            onToggleExpand={() => toggleCatKey(catKey)}
                            onEditGoal={openEditGoal}
                            onPressGoal={openGoalActions}
                          />
                        );
                      })}
                    </PriorityAccordion>
                  );
                })}
                <CompletedSection
                  completedList={completedList}
                  dateKey={dateKey}
                  logsByGoalDate={logsByHabitDate}
                  plannedTimesByGoalDate={snapshot?.plannedTimesByHabitDate}
                  updatingKeys={updatingKeys}
                  isOpen={showCompleted}
                  onToggle={() => setShowCompleted((v) => !v)}
                  onEditGoal={openEditGoal}
                  onPressGoal={openGoalActions}
                />
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
      <HabitFormModal
        categories={categories}
        habit={editingGoal}
        initialValues={{ period: "daily" }}
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
        noteText={modalProps.noteText}
        hasPhoto={modalProps.hasPhoto}
        visibility={modalProps.visibility}
        canPlan={dateKey >= todayKey}
        isFutureDate={isFutureDate}
        plannedTime={modalProps.plannedTime ?? undefined}
        completedCount={modalProps.completedCount}
        isUpdatingVisibility={isUpdatingVisibility}
        status={modalProps.status}
        isUpdating={modalProps.isUpdating}
        uploadingPhotoSource={uploadingPhotoSource}
        visible={Boolean(activeGoal)}
        onAddPhoto={(source) => {
          if (!activeGoal) return;
          setCrashContext("goal_actions_modal", {
            dateKey,
            goalId: activeGoal.id,
            period: activeGoal.period,
            phase: `action:photo:${source}`,
          });
          addCrashBreadcrumb("Goal actions photo selected", {
            goalId: activeGoal.id,
            source,
          });
          void handleAddPhoto(activeGoal.id, source);
        }}
        onOpenNote={() => {
          if (!activeGoal) return;
          setCrashContext("goal_actions_modal", {
            dateKey,
            goalId: activeGoal.id,
            period: activeGoal.period,
            phase: "action:open-note",
          });
          addCrashBreadcrumb("Goal actions note selected", {
            goalId: activeGoal.id,
          });
          setNoteGoal(activeGoal);
          handleGoalActionsDismiss(activeGoal, "open-note");
        }}
        onSetVisibility={(visibility) => {
          if (!activeGoal) return;
          setCrashContext("goal_actions_modal", {
            dateKey,
            goalId: activeGoal.id,
            period: activeGoal.period,
            phase: `action:visibility:${visibility}`,
          });
          addCrashBreadcrumb("Goal actions visibility selected", {
            goalId: activeGoal.id,
            visibility,
          });
          void handleSetVisibility(activeGoal.id, visibility);
        }}
        onSetStatus={(newStatus: HabitLogStatus, planOptions) => {
          if (!activeGoal) return;
          setCrashContext("goal_actions_modal", {
            dateKey,
            goalId: activeGoal.id,
            period: activeGoal.period,
            phase: `action:status:${newStatus ?? "clear"}`,
          });
          addCrashBreadcrumb("Goal actions status selected", {
            goalId: activeGoal.id,
            status: newStatus,
          });
          void handleSetStatus(activeGoal.id, newStatus, planOptions);
          if (planOptions?.completedCount === undefined) {
            handleGoalActionsDismiss(activeGoal, "set-status");
          }
        }}
        onDismiss={() => {
          if (activeGoal) {
            handleGoalActionsDismiss(activeGoal, "user");
          }
        }}
        onShown={() => {
          if (activeGoal) {
            handleGoalActionsShown(activeGoal);
          }
        }}
      />
      {noteGoal ? (
        <GoalNoteEditorModal
          dateKey={dateKey}
          goalName={noteGoal.name}
          initialValue={
            snapshot?.notesByHabitDate[`${noteGoal.id}_${dateKey}`] ?? null
          }
          onClose={() => setNoteGoal(null)}
          onSave={async (notes) => {
            await handleSaveNote(noteGoal.id, notes);
            setActiveGoal(noteGoal);
          }}
        />
      ) : null}
      <CelebrationOverlay
        visible={celebrate}
        source={confettiSource}
        withLogo
        onDone={() => setCelebrate(false)}
      />
      <CelebrationOverlay
        visible={fireCelebrate}
        source={fireSource}
        withHaptics={false}
        onDone={() => setFireCelebrate(false)}
      />
    </View>
  );
}
