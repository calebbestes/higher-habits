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

import { CalendarSelectionModal } from "@/components/calendar-selection-modal";
import {
  CelebrationOverlay,
  confettiSource,
  fireSource,
} from "@/components/celebration-overlay";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { HabitFormModal } from "@/components/habits-manager-screen";
import {
  CreateSectionHeaderTabs,
  PageHeaderTitle,
} from "@/components/section-header-tabs";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  getCachedData,
  isCacheFresh,
  setCachedData,
} from "@/lib/app-data-cache";
import {
  addCrashBreadcrumb,
  captureHandledError,
  setCrashContext,
} from "@/lib/crash-reporting";
import {
  type FriendGroupRow,
  type FriendRow,
  fetchFriendGroups,
  fetchFriends,
} from "@/lib/friends-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import { uploadGoalPhoto } from "@/lib/goal-photos-client";
import {
  type CategoryWithHabits,
  type HabitInCategory,
  type HabitLogStatus,
  type HabitLogsSnapshot,
  type PlannedRepeat,
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
  updateHabitColor,
} from "@/lib/habits-client";
import {
  type PlannedEvent,
  fetchPlannedEvents,
} from "@/lib/planned-events-client";
import {
  cancelHabitReminderAsync,
  scheduleHabitReminderAsync,
} from "@/lib/push-notifications";
import {
  type HabitViewMode,
  fetchUserSettings,
} from "@/lib/user-settings-client";

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

const PERIOD_GROUPS = [
  {
    icon: "mdi:calendar-today",
    id: "period-daily",
    name: "Daily",
    period: "daily",
  },
  {
    icon: "mdi:calendar-week",
    id: "period-weekly",
    name: "Weekly",
    period: "weekly",
  },
  {
    icon: "mdi:calendar-month",
    id: "period-monthly",
    name: "Monthly",
    period: "monthly",
  },
] as const;

type PeriodKey = (typeof PERIOD_GROUPS)[number]["period"];
type PeriodHabitGroup = {
  category: CategoryWithHabits;
  goals: HabitInCategory[];
};

const HABIT_VIEW_MODES = [
  { id: "priority", label: "Priority" },
  { id: "visibility", label: "Visibility" },
  { id: "cadence", label: "Cadence" },
] as const;

type HabitDisplayGroup = {
  id: string;
  label: string;
  total: number;
  completed: number;
  groups: PeriodHabitGroup[];
  completedList: Array<{
    goal: HabitInCategory;
    category: CategoryWithHabits;
  }>;
};

type DailyGoalsScreenCache = {
  categories: Category[];
  friendGroups: FriendGroupRow[];
  friends: FriendRow[];
  snapshot: HabitLogsSnapshot;
};

const DAILY_GOALS_SCREEN_CACHE_PREFIX = "screen:daily-goals:";

export function DailyGoalsScreen({
  initialDateKey,
  onDateChange,
}: {
  initialDateKey?: string;
  onDateChange?: (dateKey: string) => void;
}) {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const initialSelectedDate =
    initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey)
      ? (() => {
          const [y, m, d] = initialDateKey.split("-").map(Number);
          return new Date(y, (m as number) - 1, d as number);
        })()
      : new Date();
  const initialMonthKey = getMonthKey(initialSelectedDate);
  const initialCachedScreen = getCachedData<DailyGoalsScreenCache>(
    `${DAILY_GOALS_SCREEN_CACHE_PREFIX}${initialMonthKey}`,
  );

  const [selectedDate, setSelectedDate] = useState<Date>(initialSelectedDate);
  const [snapshot, setSnapshot] = useState<HabitLogsSnapshot | null>(
    initialCachedScreen?.data.snapshot ?? null,
  );
  const [logsByHabitDate, setLogsByGoalDate] = useState<
    HabitLogsSnapshot["logsByHabitDate"]
  >(initialCachedScreen?.data.snapshot.logsByHabitDate ?? {});
  const [completedCountsByHabitDate, setCompletedCountsByHabitDate] = useState<
    HabitLogsSnapshot["completedCountsByHabitDate"]
  >(initialCachedScreen?.data.snapshot.completedCountsByHabitDate ?? {});
  const [calendarPlannedEvents, setCalendarPlannedEvents] = useState<
    PlannedEvent[]
  >([]);
  const [isLoading, setIsLoading] = useState(!initialCachedScreen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());
  const [openPriorities, setOpenPriorities] = useState<Set<string>>(
    () => new Set(["high", "daily", "all_friends"]),
  );
  const [habitViewMode, setHabitViewMode] = useState<HabitViewMode>("priority");
  const [expandedCatKeys, setExpandedCatKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeGoal, setActiveGoal] = useState<ActionGoal | null>(null);
  const [noteGoal, setNoteGoal] = useState<ActionGoal | null>(null);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(
    () =>
      new Date(
        initialSelectedDate.getFullYear(),
        initialSelectedDate.getMonth(),
        1,
      ),
  );
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Habit | null>(null);
  const [categories, setCategories] = useState<Category[]>(
    initialCachedScreen?.data.categories ?? [],
  );
  const [friends, setFriends] = useState<FriendRow[]>(
    initialCachedScreen?.data.friends ?? [],
  );
  const [friendGroups, setFriendGroups] = useState<FriendGroupRow[]>(
    initialCachedScreen?.data.friendGroups ?? [],
  );
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

  // Calendar scheduling may use habit_instance events (especially when a
  // habit has multiple daily completions) without creating a matching habit
  // log. Treat those events as planned in this screen as well.
  const displayLogsByHabitDate = useMemo(() => {
    const next = { ...logsByHabitDate };
    for (const event of calendarPlannedEvents) {
      const habitId = event.sourceParentId ?? event.sourceId;
      if (habitId) next[`${habitId}_${dateKey}`] ??= "planned";
    }
    return next;
  }, [calendarPlannedEvents, dateKey, logsByHabitDate]);

  const displayPlannedTimesByHabitDate = useMemo(() => {
    const next = { ...(snapshot?.plannedTimesByHabitDate ?? {}) };
    for (const event of calendarPlannedEvents) {
      const habitId = event.sourceParentId ?? event.sourceId;
      if (!habitId) continue;
      const key = `${habitId}_${dateKey}`;
      next[key] ??= {
        endTime: event.endTime,
        repeat: null,
        repeatsDaily: false,
        startTime: event.startTime,
      };
    }
    return next;
  }, [calendarPlannedEvents, dateKey, snapshot?.plannedTimesByHabitDate]);

  useEffect(() => {
    onDateChange?.(dateKey);
  }, [dateKey, onDateChange]);

  useEffect(() => {
    let active = true;
    setCalendarPlannedEvents([]);
    void fetchPlannedEvents({ dateKey, sourceType: "habit_instance" })
      .then((events) => {
        if (active) setCalendarPlannedEvents(events);
      })
      .catch(() => {
        if (active) setCalendarPlannedEvents([]);
      });

    return () => {
      active = false;
    };
  }, [dateKey]);

  useEffect(() => {
    let active = true;
    void fetchUserSettings()
      .then((settings) => {
        if (active) setHabitViewMode(settings.defaultHabitView);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

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

  const openDatePicker = useCallback(() => {
    setDatePickerMonth(
      new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    );
    setDatePickerOpen(true);
  }, [selectedDate]);

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
      const cacheKey = `${DAILY_GOALS_SCREEN_CACHE_PREFIX}${monthKey}`;
      const cached = getCachedData<DailyGoalsScreenCache>(cacheKey);
      if (!refresh && cached) {
        setSnapshot(cached.data.snapshot);
        setLogsByGoalDate(cached.data.snapshot.logsByHabitDate);
        setCompletedCountsByHabitDate(
          cached.data.snapshot.completedCountsByHabitDate,
        );
        setCategories(cached.data.categories);
        setFriends(cached.data.friends);
        setFriendGroups(cached.data.friendGroups);
        setIsLoading(false);
        if (isCacheFresh(cached)) return;
      }
      refresh ? setIsRefreshing(true) : setIsLoading(!cached);
      setError(null);
      try {
        const [snap, cats, nextFriends, nextFriendGroups] = await Promise.all([
          fetchHabitLogsSnapshot(monthKey),
          fetchCategories(),
          fetchFriends().catch(() => [] as FriendRow[]),
          fetchFriendGroups().catch(() => [] as FriendGroupRow[]),
        ]);
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }
        setSnapshot(snap);
        setLogsByGoalDate(snap.logsByHabitDate);
        setCompletedCountsByHabitDate(snap.completedCountsByHabitDate);
        setCategories(cats);
        setFriends(
          nextFriends.filter((friend) => friend.status === "accepted"),
        );
        setFriendGroups(nextFriendGroups);
        setCachedData(cacheKey, {
          categories: cats,
          friendGroups: nextFriendGroups,
          friends: nextFriends.filter((friend) => friend.status === "accepted"),
          snapshot: snap,
        });
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

  const confirmDeleteHabit = (habit: Habit) => {
    Alert.alert(
      "Delete habit?",
      `"${habit.name}" and its history will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteHabit(habit.id);
              await cancelHabitReminderAsync(habit.id);
              await load();
              setFormOpen(false);
              setEditingGoal(null);
            } catch (deleteError) {
              captureHandledError(deleteError, {
                handler: "confirmDeleteHabit",
              });
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

  const addCategory = async (name: string, icon: string): Promise<Category> => {
    const category = await createCategory({ name, icon });
    setCategories((current) => [...current, category]);
    return category;
  };

  const openEditGoal = (goal: HabitInCategory) => {
    addCrashBreadcrumb("openEditGoal", { goalId: goal.id });
    const category = categories.find((item) => item.id === goal.categoryId);
    const editableGoal = goal as HabitInCategory &
      Partial<
        Pick<
          Habit,
          | "createdAt"
          | "repeatDays"
          | "repeatCadence"
          | "repeatInterval"
          | "repeatMonthlyType"
          | "updatedAt"
        >
      >;
    setEditingGoal({
      ...editableGoal,
      categoryName: category?.name ?? "",
      categoryIcon: category?.icon ?? "",
      goalId: goal.goalId,
      goalTitle: goal.goalTitle,
      audienceFriendIds: editableGoal.audienceFriendIds ?? [],
      audienceGroupIds: editableGoal.audienceGroupIds ?? [],
      repeatCadence: editableGoal.repeatCadence ?? editableGoal.period,
      repeatInterval: editableGoal.repeatInterval ?? 1,
      repeatDays: editableGoal.repeatDays ?? null,
      repeatMonthlyType: editableGoal.repeatMonthlyType ?? null,
      reminderTimes:
        editableGoal.reminderTimes ??
        (editableGoal.reminderTime ? [editableGoal.reminderTime] : null),
      createdAt: editableGoal.createdAt ?? new Date().toISOString(),
      updatedAt: editableGoal.updatedAt ?? editableGoal.createdAt ?? "",
    });
    setFormOpen(true);
  };

  const handleSetStatus = useCallback(
    async (
      goalId: string,
      status: HabitLogStatus,
      options?: {
        endTime?: string | null;
        repeat?: PlannedRepeat | null;
        repeatPlan?: boolean;
        repeatStop?: boolean;
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
              repeat:
                options?.repeat ??
                (options?.repeatPlan
                  ? {
                      cadence: "daily",
                      interval: 1,
                      days: null,
                      monthlyType: null,
                    }
                  : null),
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

  const periodicHabits = useMemo(
    () =>
      snapshot?.periodicHabits.map<HabitInCategory>((goal) => ({
        ...goal,
        hidden: false,
      })) ?? [],
    [snapshot],
  );

  const periodHabitGroups = useMemo<PeriodHabitGroup[]>(() => {
    const habitsByPeriod: Record<PeriodKey, HabitInCategory[]> = {
      daily: [],
      monthly: [],
      weekly: [],
    };

    for (const category of categoriesWithGoals) {
      for (const habit of category.habits) {
        habitsByPeriod[habit.period].push(habit);
      }
    }

    for (const habit of periodicHabits) {
      habitsByPeriod[habit.period].push(habit);
    }

    return PERIOD_GROUPS.map((group) => {
      const goals = habitsByPeriod[group.period];
      return {
        category: {
          goals,
          habits: goals,
          icon: group.icon,
          id: group.id,
          name: group.name,
        },
        goals,
      };
    }).filter((group) => group.goals.length > 0);
  }, [categoriesWithGoals, periodicHabits]);

  const priorityProgress = useMemo(() => {
    const progress = {
      high: { completed: 0, total: 0 },
      low: { completed: 0, total: 0 },
    };

    for (const group of periodHabitGroups) {
      for (const goal of group.goals) {
        const pr = getDailyPriorityBucket(goal);
        progress[pr].total++;
        if (
          getGoalDateStatus(goal, dateKey, displayLogsByHabitDate) ===
          "complete"
        ) {
          progress[pr].completed++;
        }
      }
    }

    return progress;
  }, [
    periodHabitGroups,
    dateKey,
    displayLogsByHabitDate,
    getDailyPriorityBucket,
  ]);

  const highGoalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of periodHabitGroups) {
      for (const goal of group.goals) {
        if (getDailyPriorityBucket(goal) === "high") {
          ids.add(goal.id);
        }
      }
    }
    return ids;
  }, [periodHabitGroups, getDailyPriorityBucket]);
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

  const habitDisplayGroups = useMemo<HabitDisplayGroup[]>(() => {
    const visibilityGroups = [
      { id: "all_friends", label: "Public", value: "all_friends" as const },
      {
        id: "goal_friends",
        label: "Select friends",
        value: "goal_friends" as const,
      },
      { id: "only_me", label: "Private", value: "only_me" as const },
    ];
    const cadenceGroups = [
      { id: "daily", label: "Daily", value: "daily" as const },
      { id: "weekly", label: "Weekly", value: "weekly" as const },
      { id: "monthly", label: "Monthly", value: "monthly" as const },
    ];

    const makeGroup = (
      id: string,
      label: string,
      matches: (goal: HabitInCategory) => boolean,
    ): HabitDisplayGroup => {
      const matchingGoals = periodHabitGroups.flatMap((group) =>
        group.goals.filter(matches),
      );
      const completedList = periodHabitGroups.flatMap((group) =>
        group.goals
          .filter(
            (goal) =>
              matches(goal) &&
              getGoalDateStatus(goal, dateKey, displayLogsByHabitDate) ===
                "complete",
          )
          .map((goal) => ({ goal, category: group.category })),
      );
      const groups = periodHabitGroups
        .map((group) => ({
          category: group.category,
          goals: group.goals.filter(
            (goal) =>
              matches(goal) &&
              getGoalDateStatus(goal, dateKey, displayLogsByHabitDate) !==
                "complete",
          ),
        }))
        .filter((group) => group.goals.length > 0);

      return {
        id,
        label,
        total: matchingGoals.length,
        completed: completedList.length,
        groups,
        completedList,
      };
    };

    if (habitViewMode === "visibility") {
      return visibilityGroups.map(({ id, label, value }) =>
        makeGroup(id, label, (goal) => goal.visibility === value),
      );
    }
    if (habitViewMode === "cadence") {
      return cadenceGroups.map(({ id, label, value }) =>
        makeGroup(id, label, (goal) => goal.period === value),
      );
    }

    return (["high", "low"] as const).map((priority) =>
      makeGroup(
        priority,
        PRIORITY_LABELS[priority],
        (goal) => getDailyPriorityBucket(goal) === priority,
      ),
    );
  }, [
    dateKey,
    getDailyPriorityBucket,
    habitViewMode,
    displayLogsByHabitDate,
    periodHabitGroups,
  ]);

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

  const handleSetGoalColor = useCallback(
    async (color: string | null) => {
      if (!activeGoal) return;

      const goal = activeGoal;
      const colorKey = `color-${goal.id}`;
      setUpdatingKeys((current) => new Set(current).add(colorKey));
      try {
        const updatedHabit = await updateHabitColor(goal.id, color);
        setActiveGoal((current) =>
          current?.id === updatedHabit.id
            ? { ...current, color: updatedHabit.color }
            : current,
        );
        const nextSnapshot = await fetchHabitLogsSnapshot(monthKey);
        if (!isMountedRef.current) return;
        setSnapshot(nextSnapshot);
        setLogsByGoalDate(nextSnapshot.logsByHabitDate);
        setCompletedCountsByHabitDate(nextSnapshot.completedCountsByHabitDate);
      } catch (colorError) {
        Alert.alert(
          "Could not update color",
          colorError instanceof Error
            ? colorError.message
            : "Could not update this habit's color.",
        );
      } finally {
        setUpdatingKeys((current) => {
          const next = new Set(current);
          next.delete(colorKey);
          return next;
        });
      }
    },
    [activeGoal, monthKey],
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
        plannedTime: displayPlannedTimesByHabitDate[key] ?? null,
        visibility:
          snapshot?.visibilityByHabitDate?.[key] ??
          activeGoal.visibility ??
          "only_me",
        status: getGoalDateStatus(activeGoal, dateKey, displayLogsByHabitDate),
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
          canCancelContentTouches
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          directionalLockEnabled
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
              <PageHeaderTitle title="Create" />
              <CreateSectionHeaderTabs currentSection="habits" />
            </View>
            <Pressable
              accessibilityLabel="Add habit"
              accessibilityRole="button"
              onPress={() => setFormOpen(true)}
              style={({ pressed }) => [
                styles.addButton,
                styles.headerAddButton,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("plus", "add")}
                size={24}
                weight="semibold"
                tintColor={theme.primary}
              />
            </Pressable>
          </View>

          {/* Date navigator */}
          <View style={styles.dateNav}>
            <Pressable
              accessibilityLabel="Previous day"
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                moveDate(-1);
              }}
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

            <Pressable
              accessibilityLabel="Choose day"
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                openDatePicker();
              }}
              style={({ pressed }) => [
                styles.dateLabel,
                pressed && styles.pressed,
              ]}
            >
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
                  <Text style={[styles.todayBadgeText, { color: "#FFFFFF" }]}>
                    Today
                  </Text>
                </View>
              ) : null}
            </Pressable>

            <View style={styles.navRight}>
              <Pressable
                accessibilityLabel="Next day"
                hitSlop={8}
                onPress={(event) => {
                  event.stopPropagation();
                  moveDate(1);
                }}
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

          <View style={styles.habitViewPicker}>
            <Text
              style={[
                styles.habitViewPickerLabel,
                { color: theme.textSecondary },
              ]}
            >
              View by
            </Text>
            <View
              accessibilityLabel="Habit grouping"
              style={[
                styles.habitViewToggle,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.tabBorder,
                },
              ]}
            >
              {HABIT_VIEW_MODES.map((mode) => {
                const isSelected = habitViewMode === mode.id;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    key={mode.id}
                    onPress={() => setHabitViewMode(mode.id)}
                    style={({ pressed }) => [
                      styles.habitViewOption,
                      isSelected && {
                        backgroundColor: theme.tabBar,
                        borderColor: theme.tabBorder,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.habitViewOptionText,
                        {
                          color: isSelected ? theme.text : theme.textSecondary,
                        },
                      ]}
                    >
                      {mode.label}
                    </Text>
                  </Pressable>
                );
              })}
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
            ) : periodHabitGroups.length === 0 ? (
              <EmptyState onAdd={() => setFormOpen(true)} />
            ) : (
              <View style={styles.prioritySections}>
                {habitDisplayGroups.map((displayGroup) => {
                  if (displayGroup.total === 0) return null;
                  const isOpen = openPriorities.has(displayGroup.id);
                  return (
                    <PriorityAccordion
                      color={theme.primary}
                      completed={displayGroup.completed}
                      key={displayGroup.id}
                      label={displayGroup.label}
                      isOpen={isOpen}
                      total={displayGroup.total}
                      onToggle={() => togglePriority(displayGroup.id)}
                    >
                      {habitViewMode === "cadence"
                        ? displayGroup.groups
                            .flatMap(({ goals }) => goals)
                            .map((goal) => (
                              <View
                                key={goal.id}
                                style={[
                                  styles.goalSurface,
                                  {
                                    backgroundColor: theme.tabBar,
                                    borderColor: theme.tabBorder,
                                  },
                                ]}
                              >
                                <GoalRow
                                  goal={goal}
                                  status={getGoalDateStatus(
                                    goal,
                                    dateKey,
                                    displayLogsByHabitDate,
                                  )}
                                  completedCount={
                                    completedCountsByHabitDate[
                                      `${goal.id}_${dateKey}`
                                    ] ?? 0
                                  }
                                  plannedTime={
                                    displayPlannedTimesByHabitDate[
                                      `${goal.id}_${dateKey}`
                                    ]
                                  }
                                  friends={friends}
                                  friendGroups={friendGroups}
                                  isUpdating={updatingKeys.has(
                                    `${goal.id}_${dateKey}`,
                                  )}
                                  onEdit={() => openEditGoal(goal)}
                                  onPress={() => openGoalActions(goal)}
                                />
                              </View>
                            ))
                        : displayGroup.groups.map(({ category, goals }) => {
                            const catKey = `${habitViewMode}_${displayGroup.id}_${category.id}`;
                            const isExpanded = expandedCatKeys.has(catKey);
                            return (
                              <CategoryAccordionRow
                                key={catKey}
                                category={category}
                                goals={goals}
                                dateKey={dateKey}
                                logsByGoalDate={displayLogsByHabitDate}
                                completedCountsByGoalDate={
                                  completedCountsByHabitDate
                                }
                                plannedTimesByGoalDate={
                                  displayPlannedTimesByHabitDate
                                }
                                friends={friends}
                                friendGroups={friendGroups}
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
                  completedList={habitDisplayGroups.flatMap(
                    (displayGroup) => displayGroup.completedList,
                  )}
                  dateKey={dateKey}
                  logsByGoalDate={displayLogsByHabitDate}
                  plannedTimesByGoalDate={displayPlannedTimesByHabitDate}
                  friends={friends}
                  friendGroups={friendGroups}
                  updatingKeys={updatingKeys}
                  isOpen={showCompleted}
                  onToggle={() => setShowCompleted((current) => !current)}
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
        friends={friends}
        friendGroups={friendGroups}
        habit={editingGoal}
        initialValues={{ period: "daily" }}
        isOpen={formOpen}
        onAddCategory={addCategory}
        onClose={() => {
          setFormOpen(false);
          setEditingGoal(null);
        }}
        onDelete={confirmDeleteHabit}
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
        isUpdatingColor={Boolean(
          activeGoal && updatingKeys.has(`color-${activeGoal.id}`),
        )}
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
        onSetColor={(color) => void handleSetGoalColor(color)}
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
      <CalendarSelectionModal
        mode="day"
        month={datePickerMonth}
        onChangeMonth={setDatePickerMonth}
        onClose={() => setDatePickerOpen(false)}
        onSelect={(date) => {
          setSelectedDate(date);
          setDatePickerOpen(false);
        }}
        selectedDate={selectedDate}
        visible={datePickerOpen}
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
