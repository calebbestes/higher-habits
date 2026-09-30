import { GoalActionsModal } from "@/components/daily-goals/goal-actions-modal";
import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  type GestureResponderEvent,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandedEmptyState } from "@/components/branded-empty-state";
import { CalendarColorPicker } from "@/components/calendar-color-picker";
import {
  CelebrationOverlay,
  confettiSource,
} from "@/components/celebration-overlay";
import { modalStyles } from "@/components/daily-goals/shared";
import { GoalLogVisibilityControl } from "@/components/goal-log-visibility-control";
import {
  CreateSectionHeaderTabs,
  PageHeaderTitle,
} from "@/components/section-header-tabs";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  getCachedData,
  isCacheFresh,
  setCachedData,
} from "@/lib/app-data-cache";
import {
  fetchCheckpointPhotos,
  uploadCheckpointPhoto,
} from "@/lib/checkpoint-photos-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import {
  type GoalPhoto,
  fetchGoalPhotosForRange,
  uploadGoalPhoto,
} from "@/lib/goal-photos-client";
import type { GoalVisibility } from "@/lib/goals-client";
import { getLocalTimeZone } from "@/lib/google-calendar-client";
import {
  type HabitLogStatus,
  fetchAllHabitLogsSnapshot,
  fetchHabitLogsSnapshot,
  getMonthKey,
  setHabitLog,
  setHabitLogNote,
  setHabitLogVisibility,
  toDateKey,
} from "@/lib/habit-logs-client";
import { type Habit, fetchHabits } from "@/lib/habits-client";
import { playSelectionHaptic, playSuccessHaptic } from "@/lib/haptics";
import {
  PLAN_PERIODS,
  type PlanPeriod,
  getPlanTimeInput,
  normalizePlanTimeInput,
} from "@/lib/plan-time";
import {
  type PlannedEvent,
  deletePlannedEvent,
  fetchPlannedEvents,
  upsertPlannedEvent,
} from "@/lib/planned-events-client";
import {
  type Goal,
  type GoalCheckpoint,
  type GoalInput,
  archivePlanGoal,
  createPlanGoal,
  deletePlanGoal,
  fetchPlanGoals,
  linkGoal,
  reorderPlanGoals,
  unarchivePlanGoal,
  unlinkGoal,
  updatePlanGoal,
  updatePlanGoalCheckpoint,
} from "@/lib/planning-goals-client";
import { richTextToPlainText } from "@/lib/rich-text";
import { type Task, fetchTasks } from "@/lib/tasks-client";

type SymbolName = SymbolViewProps["name"];
type CheckpointDraft = {
  localId: string;
  title: string;
  targetDate: string;
  started: boolean;
  completed: boolean;
};
type ActiveCheckpoint = {
  goal: Goal;
  checkpoint: GoalCheckpoint;
};
type ToggleGoalLink = (
  goal: Goal,
  sourceType: "task" | "habit",
  sourceId: string,
) => Promise<Goal | null> | undefined;
type DateKeyParts = { year: number; month: number; day: number };
type TargetDatePart = "year" | "month" | "day";
type GoalDragSlot = { id: string; y: number; height: number };
type GoalsScreenCache = {
  goals: Goal[];
  plannedEvents: PlannedEvent[];
};
type HabitProgressById = Record<string, string[]>;
type HabitEvidenceByDate = Record<
  string,
  { hasNote: boolean; hasPhoto: boolean; noteText: string | null }
>;

function isGoalCompleted(goal: Goal) {
  return (
    Boolean(goal.archivedAt) ||
    (goal.checkpoints.length > 0 &&
      goal.checkpoints.every((checkpoint) => checkpoint.completed))
  );
}

function isGoalCurrent(goal: Goal) {
  return (
    !isGoalCompleted(goal) &&
    goal.checkpoints.some(
      (checkpoint) => checkpoint.started || checkpoint.completed,
    )
  );
}

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CLEAR_TARGET_DATE_ACTION = "clear-target-date";
const GOALS_SCREEN_CACHE_KEY = "screen:goals";
const MONTH_OPTIONS = [
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
] as const;

function getPreviousMonthKey(date: Date) {
  return getMonthKey(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

function getLast30DateKeys(referenceDate = new Date()) {
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(referenceDate);
    date.setHours(12, 0, 0, 0);
    date.setDate(referenceDate.getDate() - (29 - index));
    return toDateKey(date);
  });
}

function timestampToDateKey(timestamp: string) {
  const dateKey = timestamp.slice(0, 10);
  return DATE_KEY_REGEX.test(dateKey)
    ? dateKey
    : toDateKey(new Date(timestamp));
}

function buildHabitProgressById(
  snapshots: Array<Awaited<ReturnType<typeof fetchHabitLogsSnapshot>> | null>,
): HabitProgressById {
  const completedByHabit = new Map<string, Set<string>>();

  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    for (const [key, status] of Object.entries(snapshot.logsByHabitDate)) {
      if (status !== "complete") continue;
      const separatorIndex = key.lastIndexOf("_");
      if (separatorIndex <= 0) continue;
      const habitId = key.slice(0, separatorIndex);
      const dateKey = key.slice(separatorIndex + 1);
      const dates = completedByHabit.get(habitId) ?? new Set<string>();
      dates.add(dateKey);
      completedByHabit.set(habitId, dates);
    }
  }

  return Object.fromEntries(
    Array.from(completedByHabit, ([habitId, dates]) => [
      habitId,
      Array.from(dates).sort(),
    ]),
  );
}

function buildHabitEvidenceByDate(
  snapshots: Array<Awaited<ReturnType<typeof fetchHabitLogsSnapshot>> | null>,
  existing: HabitEvidenceByDate = {},
): HabitEvidenceByDate {
  const evidence = { ...existing };

  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    const keys = new Set([
      ...Object.keys(snapshot.notesByHabitDate),
      ...Object.keys(snapshot.photoCountsByHabitDate),
    ]);
    for (const key of keys) {
      const current = evidence[key] ?? {
        hasNote: false,
        hasPhoto: false,
        noteText: null,
      };
      const noteText = snapshot.notesByHabitDate[key]?.trim() ?? "";
      evidence[key] = {
        hasNote: current.hasNote || Boolean(noteText),
        hasPhoto:
          current.hasPhoto || (snapshot.photoCountsByHabitDate[key] ?? 0) > 0,
        noteText: current.noteText ?? (noteText || null),
      };
    }
  }

  return evidence;
}

function symbol(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function todayDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateKeyParts(dateKey: string): DateKeyParts | null {
  if (!DATE_KEY_REGEX.test(dateKey)) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getTodayDateParts(): DateKeyParts {
  const date = new Date();
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function getDatePartsForPicker(dateKey: string): DateKeyParts {
  return parseDateKeyParts(dateKey) ?? getTodayDateParts();
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatDateKey({ year, month, day }: DateKeyParts): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}

function updateDatePart(
  dateKey: string,
  part: TargetDatePart,
  value: number,
): string {
  const base = getDatePartsForPicker(dateKey);
  const next = { ...base, [part]: value };
  const daysInMonth = getDaysInMonth(next.year, next.month);

  return formatDateKey({ ...next, day: Math.min(next.day, daysInMonth) });
}

function getYearOptions(selectedYear: number | undefined): number[] {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 26 }, (_, index) => currentYear + index);

  // Keep an already-selected past year visible when editing an older item.
  if (selectedYear && !years.includes(selectedYear)) years.push(selectedYear);

  return years.sort((left, right) => left - right);
}

function menuSelectedState(selected: boolean): MenuAction["state"] {
  return selected ? "on" : undefined;
}

function formatCheckpointDate(dateKey: string | null) {
  if (!dateKey) return "No date";
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: year === new Date().getFullYear() ? undefined : "numeric",
  }).format(new Date(year, month - 1, day));
}

export function GoalsScreen() {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const cachedScreen = getCachedData<GoalsScreenCache>(GOALS_SCREEN_CACHE_KEY);
  const [goals, setGoals] = useState<Goal[]>(cachedScreen?.data.goals ?? []);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(!cachedScreen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [activeCheckpoint, setActiveCheckpoint] =
    useState<ActiveCheckpoint | null>(null);
  const [planningCheckpoint, setPlanningCheckpoint] =
    useState<ActiveCheckpoint | null>(null);
  const [activeGoalDetail, setActiveGoalDetail] = useState<Goal | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitProgressById, setHabitProgressById] = useState<HabitProgressById>(
    {},
  );
  const [habitEvidenceByDate, setHabitEvidenceByDate] =
    useState<HabitEvidenceByDate>({});
  const [activeLinkedHabit, setActiveLinkedHabit] = useState<Habit | null>(
    null,
  );
  const [linkedHabitSnapshot, setLinkedHabitSnapshot] = useState<Awaited<
    ReturnType<typeof fetchHabitLogsSnapshot>
  > | null>(null);
  const [noteLinkedHabit, setNoteLinkedHabit] = useState<Habit | null>(null);
  const [linkedHabitUploadingPhotoSource, setLinkedHabitUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const [isUpdatingLinkedHabit, setIsUpdatingLinkedHabit] = useState(false);
  const [linkUpdatingKey, setLinkUpdatingKey] = useState<string | null>(null);
  const [plannedEvents, setPlannedEvents] = useState<PlannedEvent[]>(
    cachedScreen?.data.plannedEvents ?? [],
  );
  const [celebrate, setCelebrate] = useState(false);
  const [showLaterGoals, setShowLaterGoals] = useState(false);
  const [showCompletedGoals, setShowCompletedGoals] = useState(false);
  const [draggingGoalId, setDraggingGoalId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const goalsRef = useRef<Goal[]>([]);
  const goalLayoutsRef = useRef<Record<string, { y: number; height: number }>>(
    {},
  );
  const visibleGoalIdsRef = useRef<string[]>([]);
  const dragSlotLayoutsRef = useRef<GoalDragSlot[]>([]);
  const dragVisibleGoalIdsRef = useRef<string[]>([]);
  const dragStartGoalIdsRef = useRef<string[]>([]);
  const draggingGoalIdRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  const load = useCallback(async (refresh = false) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const cached = getCachedData<GoalsScreenCache>(GOALS_SCREEN_CACHE_KEY);
    if (!refresh && cached) {
      goalsRef.current = cached.data.goals;
      setGoals(cached.data.goals);
      setPlannedEvents(cached.data.plannedEvents);
      setIsLoading(false);
      if (isCacheFresh(cached)) return;
    }
    refresh ? setIsRefreshing(true) : setIsLoading(!cached);
    setError(null);

    try {
      const referenceDate = new Date();
      const [
        nextGoals,
        nextPlannedEvents,
        nextTasks,
        nextHabits,
        allHabitLogs,
        currentHabitLogs,
        previousHabitLogs,
      ] = await Promise.all([
        fetchPlanGoals(),
        fetchPlannedEvents({ sourceType: "goal_checkpoint" }),
        fetchTasks(),
        fetchHabits(),
        fetchAllHabitLogsSnapshot().catch(() => null),
        fetchHabitLogsSnapshot(getMonthKey(referenceDate)).catch(() => null),
        fetchHabitLogsSnapshot(getPreviousMonthKey(referenceDate)).catch(
          () => null,
        ),
      ]);
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      setCachedData(GOALS_SCREEN_CACHE_KEY, {
        goals: nextGoals,
        plannedEvents: nextPlannedEvents,
      });
      goalsRef.current = nextGoals;
      setGoals(nextGoals);
      setPlannedEvents(nextPlannedEvents);
      setTasks(nextTasks);
      setHabits(nextHabits);
      setHabitProgressById(
        buildHabitProgressById(
          allHabitLogs ? [allHabitLogs] : [currentHabitLogs, previousHabitLogs],
        ),
      );
      setHabitEvidenceByDate(
        buildHabitEvidenceByDate(
          allHabitLogs ? [allHabitLogs] : [currentHabitLogs, previousHabitLogs],
        ),
      );
    } catch (loadError) {
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      if (!cached) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load goals.",
        );
      }
    } finally {
      if (isMountedRef.current && requestId === loadRequestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const searchedGoals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return goals;

    return goals.filter((goal) =>
      `${goal.title} ${goal.checkpoints
        .map((checkpoint) => checkpoint.title)
        .join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [goals, query]);
  const queryIsActive = query.trim().length > 0;
  const activeSearchedGoals = useMemo(
    () => searchedGoals.filter((goal) => !isGoalCompleted(goal)),
    [searchedGoals],
  );
  const currentGoals = useMemo(
    () => activeSearchedGoals.filter(isGoalCurrent),
    [activeSearchedGoals],
  );
  const laterGoals = useMemo(
    () => activeSearchedGoals.filter((goal) => !isGoalCurrent(goal)),
    [activeSearchedGoals],
  );
  const completedGoals = useMemo(
    () => searchedGoals.filter(isGoalCompleted),
    [searchedGoals],
  );
  const visibleGoals = useMemo(
    () =>
      queryIsActive || showLaterGoals ? activeSearchedGoals : currentGoals,
    [activeSearchedGoals, currentGoals, queryIsActive, showLaterGoals],
  );
  const onlyLaterGoalsHidden =
    !queryIsActive &&
    !showLaterGoals &&
    currentGoals.length === 0 &&
    laterGoals.length > 0;

  useEffect(() => {
    visibleGoalIdsRef.current = visibleGoals.map((goal) => goal.id);
  }, [visibleGoals]);

  const plannedEventsByCheckpointId = useMemo(() => {
    const map = new Map<string, PlannedEvent>();
    for (const event of plannedEvents) {
      if (event.sourceType === "goal_checkpoint") {
        map.set(event.sourceId, event);
      }
    }
    return map;
  }, [plannedEvents]);

  const writeGoalsCache = useCallback(
    (nextGoals: Goal[], nextPlannedEvents = plannedEvents) => {
      setCachedData(GOALS_SCREEN_CACHE_KEY, {
        goals: nextGoals,
        plannedEvents: nextPlannedEvents,
      });
    },
    [plannedEvents],
  );

  const openCreate = () => {
    setEditingGoal(null);
    setFormOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormOpen(true);
  };

  const saveGoal = async (input: GoalInput) => {
    const savedGoal = editingGoal
      ? await updatePlanGoal(editingGoal.id, input)
      : await createPlanGoal(input);

    setGoals((current) => {
      const next = editingGoal
        ? current.map((goal) => (goal.id === savedGoal.id ? savedGoal : goal))
        : [...current, savedGoal];
      goalsRef.current = next;
      writeGoalsCache(next);
      return next;
    });
    fetchPlannedEvents({ sourceType: "goal_checkpoint" })
      .then((nextPlannedEvents) => {
        setPlannedEvents(nextPlannedEvents);
        setCachedData(GOALS_SCREEN_CACHE_KEY, {
          goals: goalsRef.current,
          plannedEvents: nextPlannedEvents,
        });
      })
      .catch(() => {});
    setFormOpen(false);
    setEditingGoal(null);
  };

  const updateGoalInList = (updatedGoal: Goal | null) => {
    if (!updatedGoal) return;
    setGoals((current) => {
      const next = current.map((goal) =>
        goal.id === updatedGoal.id ? updatedGoal : goal,
      );
      goalsRef.current = next;
      writeGoalsCache(next);
      return next;
    });
  };

  const handleCheckpointSaved = (updatedGoal: Goal | null) => {
    updateGoalInList(updatedGoal);
    setActiveGoalDetail((current) =>
      current?.id === updatedGoal?.id ? updatedGoal : current,
    );
    if (!updatedGoal) return;

    // A completed checkpoint drops its calendar plan.
    const completedIds = new Set(
      updatedGoal.checkpoints
        .filter((checkpoint) => checkpoint.completed)
        .map((checkpoint) => checkpoint.id),
    );
    setPlannedEvents((current) => {
      const nextPlannedEvents = current.filter(
        (event) =>
          event.sourceType !== "goal_checkpoint" ||
          !completedIds.has(event.sourceId),
      );
      setCachedData(GOALS_SCREEN_CACHE_KEY, {
        goals: goalsRef.current,
        plannedEvents: nextPlannedEvents,
      });
      return nextPlannedEvents;
    });
  };

  const offerNextCheckpoint = (
    updatedGoal: Goal | null,
    completedCheckpointId: string,
  ) => {
    if (!updatedGoal) return;
    const completedIndex = updatedGoal.checkpoints.findIndex(
      (checkpoint) => checkpoint.id === completedCheckpointId,
    );
    const nextCheckpoint = updatedGoal.checkpoints
      .slice(Math.max(completedIndex + 1, 0))
      .find((checkpoint) => !checkpoint.completed);
    if (!nextCheckpoint) return;

    Alert.alert(
      "Start the next checkpoint?",
      `Start “${nextCheckpoint.title}” now?`,
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Start",
          onPress: () => {
            void updatePlanGoalCheckpoint(nextCheckpoint.id, {
              started: true,
              completed: false,
            }).then(handleCheckpointSaved);
          },
        },
      ],
    );
  };

  const openCheckpoint = (goal: Goal, checkpoint: GoalCheckpoint) => {
    if (checkpoint.started || checkpoint.completed) {
      setActiveCheckpoint({ goal, checkpoint });
      return;
    }

    Alert.alert(
      "Start checkpoint",
      `Start “${checkpoint.title}” for “${goal.title}”?`,
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Start",
          onPress: () => {
            setError(null);
            const startedAt = new Date().toISOString();
            const optimisticGoal: Goal = {
              ...goal,
              checkpoints: goal.checkpoints.map((item) =>
                item.id === checkpoint.id
                  ? {
                      ...item,
                      completed: false,
                      completedAt: null,
                      started: true,
                      startedAt,
                      updatedAt: startedAt,
                    }
                  : !item.completed
                    ? { ...item, started: false, startedAt: null }
                    : item,
              ),
            };
            updateGoalInList(optimisticGoal);
            setActiveGoalDetail((current) =>
              current?.id === optimisticGoal.id ? optimisticGoal : current,
            );
            void updatePlanGoalCheckpoint(checkpoint.id, {
              started: true,
              completed: false,
            })
              .then(handleCheckpointSaved)
              .catch((checkpointError) => {
                updateGoalInList(goal);
                setActiveGoalDetail((current) =>
                  current?.id === goal.id ? goal : current,
                );
                setError(
                  checkpointError instanceof Error
                    ? checkpointError.message
                    : "Could not start checkpoint.",
                );
              });
          },
        },
      ],
    );
  };

  const refreshLinkedHabitSnapshot = async () => {
    const snapshot = await fetchHabitLogsSnapshot(getMonthKey(new Date()));
    if (isMountedRef.current) {
      setLinkedHabitSnapshot(snapshot);
      setHabitEvidenceByDate((current) =>
        buildHabitEvidenceByDate([snapshot], current),
      );
    }
  };

  const openLinkedHabit = (habit: Habit) => {
    setActiveLinkedHabit(habit);
    setLinkedHabitSnapshot(null);
    void fetchHabitLogsSnapshot(getMonthKey(new Date()))
      .then((snapshot) => {
        if (isMountedRef.current) {
          setLinkedHabitSnapshot(snapshot);
          setHabitEvidenceByDate((current) =>
            buildHabitEvidenceByDate([snapshot], current),
          );
        }
      })
      .catch(() => undefined);
  };

  const updateLinkedHabitStatus = async (status: HabitLogStatus) => {
    if (!activeLinkedHabit || isUpdatingLinkedHabit) return;

    const dateKey = toDateKey(new Date());
    const habitId = activeLinkedHabit.id;
    const currentDates = habitProgressById[habitId] ?? [];
    const nextDates =
      status === "complete"
        ? Array.from(new Set([...currentDates, dateKey])).sort()
        : currentDates.filter((date) => date !== dateKey);

    setIsUpdatingLinkedHabit(true);
    setHabitProgressById((current) => ({ ...current, [habitId]: nextDates }));
    try {
      await setHabitLog(habitId, dateKey, status);
      await refreshLinkedHabitSnapshot();
    } catch (habitError) {
      setHabitProgressById((current) => ({
        ...current,
        [habitId]: currentDates,
      }));
      Alert.alert(
        "Could not update habit",
        habitError instanceof Error ? habitError.message : "Please try again.",
      );
    } finally {
      setIsUpdatingLinkedHabit(false);
    }
  };

  const updateLinkedHabitVisibility = async (
    visibility: Parameters<typeof setHabitLogVisibility>[2],
  ) => {
    if (!activeLinkedHabit || isUpdatingLinkedHabit) return;

    setIsUpdatingLinkedHabit(true);
    try {
      await setHabitLogVisibility(
        activeLinkedHabit.id,
        toDateKey(new Date()),
        visibility,
      );
      await refreshLinkedHabitSnapshot();
    } catch (visibilityError) {
      Alert.alert(
        "Could not update visibility",
        visibilityError instanceof Error
          ? visibilityError.message
          : "The habit visibility could not be updated.",
      );
    } finally {
      setIsUpdatingLinkedHabit(false);
    }
  };

  const addLinkedHabitPhoto = async (source: GoalPhotoSource) => {
    if (!activeLinkedHabit || linkedHabitUploadingPhotoSource) return;

    setLinkedHabitUploadingPhotoSource(source);
    try {
      const photo = await pickGoalPhoto(source);
      if (!photo) return;

      await uploadGoalPhoto(activeLinkedHabit.id, toDateKey(new Date()), photo);
      await refreshLinkedHabitSnapshot();
    } catch (photoError) {
      Alert.alert(
        "Could not add photo",
        photoError instanceof Error
          ? photoError.message
          : "The photo could not be uploaded.",
      );
    } finally {
      if (isMountedRef.current) setLinkedHabitUploadingPhotoSource(null);
    }
  };

  const toggleGoalLink = async (
    goal: Goal,
    sourceType: "task" | "habit",
    sourceId: string,
  ): Promise<Goal | null> => {
    if (linkUpdatingKey) return null;

    const linkKey = `${goal.id}:${sourceType}:${sourceId}`;
    const isLinked = (goal.links ?? []).some(
      (link) => link.sourceType === sourceType && link.sourceId === sourceId,
    );
    setLinkUpdatingKey(linkKey);
    try {
      const updatedGoal = isLinked
        ? await unlinkGoal(goal.id, sourceType, sourceId)
        : await linkGoal(goal.id, sourceType, sourceId);
      updateGoalInList(updatedGoal);
      setActiveGoalDetail((current) =>
        current?.id === updatedGoal.id ? updatedGoal : current,
      );
      return updatedGoal;
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "Could not update checkpoint links.",
      );
      return null;
    } finally {
      setLinkUpdatingKey(null);
    }
  };

  const openCheckpointPlan = (active: ActiveCheckpoint) => {
    setActiveCheckpoint(null);
    setPlanningCheckpoint(active);
  };

  const saveCheckpointPlan = async ({
    dateKey,
    endTime,
    startTime,
    timeZone,
  }: {
    dateKey: string;
    endTime: string | null;
    startTime: string | null;
    timeZone: string | null;
  }) => {
    if (!planningCheckpoint) return;

    const result = await upsertPlannedEvent({
      dateKey,
      endTime,
      sourceId: planningCheckpoint.checkpoint.id,
      sourceType: "goal_checkpoint",
      startTime,
      timeZone,
      title: planningCheckpoint.checkpoint.title,
    });

    setPlannedEvents((current) => {
      const filtered = current.filter(
        (event) =>
          event.sourceType !== "goal_checkpoint" ||
          event.sourceId !== planningCheckpoint.checkpoint.id,
      );
      const nextPlannedEvents = [...filtered, result.event];
      setCachedData(GOALS_SCREEN_CACHE_KEY, {
        goals: goalsRef.current,
        plannedEvents: nextPlannedEvents,
      });
      return nextPlannedEvents;
    });
  };

  const clearCheckpointPlan = async (active: ActiveCheckpoint) => {
    setActiveCheckpoint(null);
    setError(null);

    try {
      await deletePlannedEvent({
        sourceId: active.checkpoint.id,
        sourceType: "goal_checkpoint",
      });
      setPlannedEvents((current) => {
        const nextPlannedEvents = current.filter(
          (event) =>
            event.sourceType !== "goal_checkpoint" ||
            event.sourceId !== active.checkpoint.id,
        );
        setCachedData(GOALS_SCREEN_CACHE_KEY, {
          goals: goalsRef.current,
          plannedEvents: nextPlannedEvents,
        });
        return nextPlannedEvents;
      });
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Could not clear checkpoint plan.",
      );
    }
  };

  const confirmDelete = (goal: Goal) => {
    Alert.alert(
      "Delete goal?",
      `"${goal.title}" will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePlanGoal(goal.id);
              const checkpointIds = new Set(
                goal.checkpoints.map((checkpoint) => checkpoint.id),
              );
              setGoals((current) => {
                const next = current.filter((item) => item.id !== goal.id);
                goalsRef.current = next;
                setCachedData(GOALS_SCREEN_CACHE_KEY, {
                  goals: next,
                  plannedEvents: plannedEvents.filter(
                    (event) =>
                      event.sourceType !== "goal_checkpoint" ||
                      !checkpointIds.has(event.sourceId),
                  ),
                });
                return next;
              });
              setPlannedEvents((current) =>
                current.filter(
                  (event) =>
                    event.sourceType !== "goal_checkpoint" ||
                    !checkpointIds.has(event.sourceId),
                ),
              );
              setFormOpen(false);
              setEditingGoal(null);
              setActiveGoalDetail((current) =>
                current?.id === goal.id ? null : current,
              );
            } catch (deleteError) {
              setError(
                deleteError instanceof Error
                  ? deleteError.message
                  : "Could not delete goal.",
              );
            }
          },
        },
      ],
    );
  };

  const confirmArchive = (goal: Goal) => {
    Alert.alert(
      "Archive goal?",
      `“${goal.title}” will move to Completed goals.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          onPress: async () => {
            try {
              const archivedGoal = await archivePlanGoal(goal.id);
              updateGoalInList(archivedGoal);
              setActiveGoalDetail((current) =>
                current?.id === archivedGoal.id ? archivedGoal : current,
              );
              setFormOpen(false);
              setEditingGoal(null);
              setPlannedEvents((current) => {
                const nextPlannedEvents = current.filter(
                  (event) =>
                    event.sourceType !== "goal_checkpoint" ||
                    !goal.checkpoints.some(
                      (checkpoint) => checkpoint.id === event.sourceId,
                    ),
                );
                writeGoalsCache(goalsRef.current, nextPlannedEvents);
                return nextPlannedEvents;
              });
            } catch (archiveError) {
              setError(
                archiveError instanceof Error
                  ? archiveError.message
                  : "Could not archive goal.",
              );
            }
          },
        },
      ],
    );
  };

  const unarchiveGoal = async (goal: Goal) => {
    try {
      const restoredGoal = await unarchivePlanGoal(goal.id);
      updateGoalInList(restoredGoal);
      setActiveGoalDetail((current) =>
        current?.id === restoredGoal.id ? restoredGoal : current,
      );
      setFormOpen(false);
      setEditingGoal(null);
    } catch (unarchiveError) {
      setError(
        unarchiveError instanceof Error
          ? unarchiveError.message
          : "Could not unarchive goal.",
      );
    }
  };

  const measureGoalCard = useCallback(
    (goalId: string, y: number, height: number) => {
      goalLayoutsRef.current[goalId] = { y, height };
    },
    [],
  );

  const playReorderHaptic = useCallback(() => {
    void (
      Platform.OS === "android"
        ? Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Segment_Tick,
          )
        : Haptics.selectionAsync()
    ).catch(() => {});
  }, []);

  const moveGoalToVisibleIndex = useCallback(
    (dragGoalId: string, destinationIndex: number) => {
      const visibleGoalIds = dragVisibleGoalIdsRef.current;
      const fromVisibleIndex = visibleGoalIds.indexOf(dragGoalId);
      const nextVisibleIndex = Math.max(
        0,
        Math.min(destinationIndex, visibleGoalIds.length - 1),
      );

      if (
        fromVisibleIndex < 0 ||
        nextVisibleIndex < 0 ||
        fromVisibleIndex === nextVisibleIndex
      ) {
        return;
      }

      const nextVisibleGoalIds = [...visibleGoalIds];
      const [movedGoalId] = nextVisibleGoalIds.splice(fromVisibleIndex, 1);
      nextVisibleGoalIds.splice(nextVisibleIndex, 0, movedGoalId);
      dragVisibleGoalIdsRef.current = nextVisibleGoalIds;

      const current = goalsRef.current;
      const currentGoalsById = new Map(current.map((goal) => [goal.id, goal]));
      const nextVisibleGoalIdSet = new Set(nextVisibleGoalIds);
      let visibleIndex = 0;

      const next = current.map((goal) => {
        if (!nextVisibleGoalIdSet.has(goal.id)) return goal;
        const visibleGoalId = nextVisibleGoalIds[visibleIndex++];
        return currentGoalsById.get(visibleGoalId) ?? goal;
      });
      goalsRef.current = next;
      writeGoalsCache(next);
      setGoals(next);
      playReorderHaptic();
    },
    [playReorderHaptic, writeGoalsCache],
  );

  const beginGoalDrag = useCallback((goalId: string) => {
    dragStartGoalIdsRef.current = goalsRef.current.map((goal) => goal.id);
    dragVisibleGoalIdsRef.current = visibleGoalIdsRef.current;
    dragSlotLayoutsRef.current = visibleGoalIdsRef.current
      .map((id) => {
        const layout = goalLayoutsRef.current[id];
        return layout ? { id, ...layout } : null;
      })
      .filter((slot): slot is GoalDragSlot => Boolean(slot))
      .sort((a, b) => a.y - b.y);
    draggingGoalIdRef.current = goalId;
    setDraggingGoalId(goalId);
  }, []);

  const handleGoalDragMove = useCallback(
    (event: GestureResponderEvent) => {
      const dragGoalId = draggingGoalIdRef.current;
      if (!dragGoalId) return;

      const y = event.nativeEvent.pageY;
      const slotLayouts = dragSlotLayoutsRef.current;
      if (slotLayouts.length === 0) return;

      let destinationIndex = slotLayouts.length - 1;
      for (let index = 0; index < slotLayouts.length; index += 1) {
        const slot = slotLayouts[index];
        if (y < slot.y + slot.height / 2) {
          destinationIndex = index;
          break;
        }
      }

      moveGoalToVisibleIndex(dragGoalId, destinationIndex);
    },
    [moveGoalToVisibleIndex],
  );

  const endGoalDrag = useCallback(() => {
    const dragGoalId = draggingGoalIdRef.current;
    draggingGoalIdRef.current = null;
    setDraggingGoalId(null);

    if (!dragGoalId) return;

    const nextGoalIds = goalsRef.current.map((goal) => goal.id);
    if (nextGoalIds.join("|") === dragStartGoalIdsRef.current.join("|")) {
      return;
    }

    reorderPlanGoals(nextGoalIds).catch((reorderError) => {
      setError(
        reorderError instanceof Error
          ? reorderError.message
          : "Could not reorder goals.",
      );
      void load();
    });
  }, [load]);

  const linkedHabitDateKey = toDateKey(new Date());
  const linkedHabitLogKey = activeLinkedHabit
    ? `${activeLinkedHabit.id}_${linkedHabitDateKey}`
    : null;
  const linkedHabitStatus = activeLinkedHabit
    ? (linkedHabitSnapshot?.logsByHabitDate[linkedHabitLogKey ?? ""] ??
      ((habitProgressById[activeLinkedHabit.id] ?? []).includes(
        linkedHabitDateKey,
      )
        ? "complete"
        : "incomplete"))
    : undefined;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {activeGoalDetail ? (
        <GoalDetailModal
          goal={activeGoalDetail}
          habits={habits}
          habitEvidenceByDate={habitEvidenceByDate}
          habitProgressById={habitProgressById}
          tasks={tasks}
          onClose={() => setActiveGoalDetail(null)}
          onPressHabit={openLinkedHabit}
          onPressCheckpoint={openCheckpoint}
        />
      ) : (
        <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
          <ScrollView
            canCancelContentTouches
            contentContainerStyle={[
              styles.content,
              { paddingBottom: tabBarHeight + 16 },
            ]}
            directionalLockEnabled
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                tintColor={theme.primary}
                onRefresh={() => void load(true)}
              />
            }
            scrollEnabled={!draggingGoalId}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.pageHeader}>
              <View style={styles.pageHeaderLeft}>
                <View style={styles.pageHeaderText}>
                  <PageHeaderTitle title="Create" />
                  <CreateSectionHeaderTabs currentSection="goals" />
                </View>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityLabel="Add goal"
                  accessibilityRole="button"
                  onPress={openCreate}
                  style={({ pressed }) => [
                    styles.addButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={symbol("plus", "add")}
                    size={28}
                    weight="semibold"
                    tintColor={theme.primary}
                  />
                </Pressable>
              </View>
            </View>

            <View
              style={[
                styles.search,
                {
                  backgroundColor: "transparent",
                  borderColor: `${theme.tabBorder}AA`,
                },
              ]}
            >
              <SymbolView
                name={symbol("magnifyingglass", "search")}
                size={18}
                tintColor={theme.textSecondary}
              />
              <TextInput
                accessibilityLabel="Search goals"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder="Search goals"
                placeholderTextColor={theme.textSecondary}
                selectionColor={theme.primary}
                style={[styles.searchInput, { color: theme.text }]}
                value={query}
              />
              {query ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  hitSlop={10}
                  onPress={() => setQuery("")}
                >
                  <SymbolView
                    name={symbol("xmark.circle.fill", "cancel")}
                    size={18}
                    tintColor={theme.textSecondary}
                  />
                </Pressable>
              ) : null}
            </View>

            {error ? (
              <View style={styles.errorBanner}>
                <SymbolView
                  name={symbol("exclamationmark.circle.fill", "error")}
                  size={18}
                  tintColor="#9D474D"
                />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => void load()}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {isLoading ? (
              <View style={styles.centerState}>
                <FloatingLogoLoader />
              </View>
            ) : visibleGoals.length ? (
              <>
                <View style={styles.goalList}>
                  {visibleGoals.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      isDragging={draggingGoalId === goal.id}
                      onDragEnd={endGoalDrag}
                      onDragMove={handleGoalDragMove}
                      onDragStart={beginGoalDrag}
                      onEdit={() => openEdit(goal)}
                      onMeasure={measureGoalCard}
                      onPressGoal={() => setActiveGoalDetail(goal)}
                      onPressCheckpoint={(checkpoint) =>
                        openCheckpoint(goal, checkpoint)
                      }
                    />
                  ))}
                </View>
                {!queryIsActive && laterGoals.length > 0 ? (
                  <LaterGoalsToggle
                    count={laterGoals.length}
                    expanded={showLaterGoals}
                    onPress={() => setShowLaterGoals((current) => !current)}
                  />
                ) : null}
              </>
            ) : onlyLaterGoalsHidden ? (
              <>
                <View style={styles.centerState}>
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>
                    No current goals
                  </Text>
                  <Text
                    style={[
                      styles.emptyDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Later goals are hidden.
                  </Text>
                </View>
                <LaterGoalsToggle
                  count={laterGoals.length}
                  expanded={showLaterGoals}
                  onPress={() => setShowLaterGoals((current) => !current)}
                />
              </>
            ) : completedGoals.length > 0 ? null : (
              <>
                <EmptyState
                  hasGoals={goals.length > 0}
                  onAdd={openCreate}
                  query={query}
                />
              </>
            )}
            {!isLoading && completedGoals.length > 0 ? (
              <>
                <LaterGoalsToggle
                  count={completedGoals.length}
                  expanded={showCompletedGoals}
                  label="completed"
                  onPress={() => setShowCompletedGoals((current) => !current)}
                />
                {showCompletedGoals ? (
                  <View style={styles.goalList}>
                    {completedGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        isDragging={false}
                        onDragEnd={() => undefined}
                        onDragMove={() => undefined}
                        onDragStart={() => undefined}
                        onEdit={() => openEdit(goal)}
                        onMeasure={() => undefined}
                        onPressGoal={() => setActiveGoalDetail(goal)}
                        onPressCheckpoint={(checkpoint) =>
                          openCheckpoint(goal, checkpoint)
                        }
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      )}

      <GoalFormModal
        goal={editingGoal}
        habits={habits}
        isOpen={formOpen}
        linkUpdatingKey={linkUpdatingKey}
        onClose={() => {
          setFormOpen(false);
          setEditingGoal(null);
        }}
        onDelete={() => {
          if (editingGoal) confirmDelete(editingGoal);
        }}
        onArchive={() => {
          if (editingGoal) confirmArchive(editingGoal);
        }}
        onUnarchive={() => {
          if (editingGoal) void unarchiveGoal(editingGoal);
        }}
        onSave={saveGoal}
        onToggleLink={toggleGoalLink}
        tasks={tasks}
      />
      <CheckpointActionsModal
        active={activeCheckpoint}
        plannedEvent={
          activeCheckpoint
            ? plannedEventsByCheckpointId.get(activeCheckpoint.checkpoint.id)
            : null
        }
        onClose={() => setActiveCheckpoint(null)}
        onClearPlan={clearCheckpointPlan}
        onEditGoal={(goal) => {
          setActiveCheckpoint(null);
          openEdit(goal);
        }}
        onPlan={openCheckpointPlan}
        onSaved={handleCheckpointSaved}
        onCompleted={offerNextCheckpoint}
        onError={setError}
      />
      <GoalActionsModal
        goal={activeLinkedHabit}
        visible={Boolean(activeLinkedHabit)}
        hasNote={Boolean(
          linkedHabitLogKey &&
            linkedHabitSnapshot?.notesByHabitDate[linkedHabitLogKey]?.trim(),
        )}
        noteText={
          linkedHabitLogKey
            ? linkedHabitSnapshot?.notesByHabitDate[linkedHabitLogKey]
            : null
        }
        hasPhoto={Boolean(
          linkedHabitLogKey &&
            (linkedHabitSnapshot?.photoCountsByHabitDate[linkedHabitLogKey] ??
              0) > 0,
        )}
        visibility={
          linkedHabitLogKey
            ? (linkedHabitSnapshot?.visibilityByHabitDate[linkedHabitLogKey] ??
              activeLinkedHabit?.visibility ??
              "only_me")
            : (activeLinkedHabit?.visibility ?? "only_me")
        }
        status={linkedHabitStatus}
        completedCount={
          linkedHabitLogKey
            ? linkedHabitSnapshot?.completedCountsByHabitDate[linkedHabitLogKey]
            : undefined
        }
        isUpdating={isUpdatingLinkedHabit}
        isUpdatingVisibility={isUpdatingLinkedHabit}
        canPlan={false}
        isFutureDate={false}
        uploadingPhotoSource={linkedHabitUploadingPhotoSource}
        onAddPhoto={(source) => void addLinkedHabitPhoto(source)}
        onOpenNote={() => {
          if (!activeLinkedHabit) return;
          setNoteLinkedHabit(activeLinkedHabit);
          setActiveLinkedHabit(null);
        }}
        onSetVisibility={(visibility) =>
          void updateLinkedHabitVisibility(visibility)
        }
        onSetStatus={(status) => void updateLinkedHabitStatus(status)}
        onDismiss={() => {
          setActiveLinkedHabit(null);
          setLinkedHabitSnapshot(null);
        }}
        onShown={() => undefined}
      />
      {noteLinkedHabit ? (
        <GoalNoteEditorModal
          dateKey={linkedHabitDateKey}
          goalName={noteLinkedHabit.name}
          initialValue={
            linkedHabitSnapshot?.notesByHabitDate[
              `${noteLinkedHabit.id}_${linkedHabitDateKey}`
            ] ?? null
          }
          onClose={() => setNoteLinkedHabit(null)}
          onSave={async (notes) => {
            await setHabitLogNote(
              noteLinkedHabit.id,
              linkedHabitDateKey,
              notes,
            );
            await refreshLinkedHabitSnapshot();
            setActiveLinkedHabit(noteLinkedHabit);
          }}
        />
      ) : null}
      <CheckpointPlanModal
        active={planningCheckpoint}
        existingPlan={
          planningCheckpoint
            ? plannedEventsByCheckpointId.get(planningCheckpoint.checkpoint.id)
            : null
        }
        onClose={() => setPlanningCheckpoint(null)}
        onSave={saveCheckpointPlan}
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

function GoalCard({
  goal,
  isDragging,
  onDragEnd,
  onDragMove,
  onDragStart,
  onEdit,
  onMeasure,
  onPressGoal,
  onPressCheckpoint,
}: {
  goal: Goal;
  isDragging: boolean;
  onDragEnd: () => void;
  onDragMove: (event: GestureResponderEvent) => void;
  onDragStart: (goalId: string) => void;
  onEdit: () => void;
  onMeasure: (goalId: string, y: number, height: number) => void;
  onPressGoal: () => void;
  onPressCheckpoint: (checkpoint: GoalCheckpoint) => void;
}) {
  const theme = useTheme();
  const cardRef = useRef<View>(null);
  return (
    <View
      ref={cardRef}
      onLayout={() => {
        cardRef.current?.measureInWindow((_x, y, _width, height) => {
          onMeasure(goal.id, y, height);
        });
      }}
      style={[
        styles.goalCard,
        {
          backgroundColor: theme.tabBar,
          borderColor: theme.tabBorder,
          shadowColor:
            theme.background === "#ffffff" ? theme.secondary : "#000",
        },
        isDragging && styles.goalCardDragging,
      ]}
    >
      <View style={styles.goalCardContent}>
        <View
          accessible
          accessibilityHint="Hold and drag to reorder this goal."
          accessibilityLabel={`Reorder ${goal.title}`}
          accessibilityRole="button"
          hitSlop={8}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={() => onDragStart(goal.id)}
          onResponderMove={onDragMove}
          onResponderRelease={onDragEnd}
          onResponderTerminate={onDragEnd}
          onResponderTerminationRequest={() => false}
          onStartShouldSetResponder={() => true}
          style={[
            styles.goalAccent,
            { backgroundColor: goal.color ?? theme.primary },
          ]}
        />
        <View style={styles.goalCardMain}>
          <View style={styles.goalCardTop}>
            <Pressable
              accessibilityLabel={`Open ${goal.title}`}
              accessibilityRole="button"
              onPress={onPressGoal}
              style={({ pressed }) => [
                styles.goalBody,
                pressed && styles.pressed,
              ]}
            >
              <Text
                numberOfLines={2}
                style={[styles.goalTitle, { color: theme.text }]}
              >
                {goal.title}
              </Text>
              <Text style={[styles.goalMeta, { color: theme.textSecondary }]}>
                Tap for details
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`Edit ${goal.title}`}
              accessibilityRole="button"
              onPress={onEdit}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={symbol("pencil", "edit")}
                size={18}
                weight="semibold"
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>

          {goal.checkpoints.length ? (
            <View style={styles.goalCheckpointList}>
              {goal.checkpoints.map((checkpoint) => (
                <Pressable
                  accessibilityLabel={`Open ${checkpoint.title} checkpoint actions`}
                  accessibilityRole="button"
                  key={checkpoint.id}
                  onPress={() => onPressCheckpoint(checkpoint)}
                  style={({ pressed }) => [
                    styles.goalCheckpointRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={symbol(
                      checkpoint.completed
                        ? "checkmark.circle.fill"
                        : checkpoint.started
                          ? "play.circle.fill"
                          : "circle",
                      checkpoint.completed
                        ? "check_circle"
                        : checkpoint.started
                          ? "play_circle"
                          : "circle",
                    )}
                    size={20}
                    tintColor={
                      checkpoint.completed || checkpoint.started
                        ? theme.primary
                        : theme.textSecondary
                    }
                  />
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.goalCheckpointText,
                      { color: theme.text },
                      checkpoint.completed && styles.completedTimelineTitle,
                    ]}
                  >
                    {checkpoint.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function HabitProgressGrid({
  completedDates,
  goalCreatedAt,
  checkpointCreatedAt,
  checkpointCompletedAt,
}: {
  completedDates: string[];
  goalCreatedAt: string;
  checkpointCreatedAt: string;
  checkpointCompletedAt: string | null;
}) {
  const theme = useTheme();
  const completed = new Set(completedDates);
  const dateKeys = getLast30DateKeys();
  const recentCompletedCount = dateKeys.filter((dateKey) =>
    completed.has(dateKey),
  ).length;
  const goalStartDateKey = timestampToDateKey(goalCreatedAt);
  const checkpointStartDateKey = timestampToDateKey(checkpointCreatedAt);
  const progressStartDateKey =
    checkpointStartDateKey < goalStartDateKey
      ? checkpointStartDateKey
      : goalStartDateKey;
  const checkpointEndDateKey = checkpointCompletedAt
    ? timestampToDateKey(checkpointCompletedAt)
    : toDateKey(new Date());
  const totalCompletedCount = completedDates.filter(
    (dateKey) =>
      dateKey >= progressStartDateKey && dateKey <= checkpointEndDateKey,
  ).length;
  const recentCompletionPercentage = Math.round(
    (recentCompletedCount / dateKeys.length) * 100,
  );

  return (
    <View style={{ gap: 5, paddingLeft: 24, width: 300 }}>
      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
        {`${totalCompletedCount} completed since goal · ${recentCompletionPercentage}% last 30 days`}
      </Text>
      <View style={{ gap: 5, width: 260 }}>
        {[0, 1, 2].map((row) => (
          <View
            key={`progress-row-${row}`}
            style={{ flexDirection: "row", gap: 5 }}
          >
            {dateKeys.slice(row * 10, row * 10 + 10).map((dateKey) => (
              <View
                key={`progress-day-${dateKey}`}
                style={{
                  backgroundColor: completed.has(dateKey)
                    ? theme.primary
                    : theme.backgroundElement,
                  borderColor: theme.tabBorder,
                  borderRadius: 2,
                  borderWidth: StyleSheet.hairlineWidth,
                  height: 18,
                  width: 20,
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function getCheckpointDetailText(checkpoint: GoalCheckpoint) {
  if (checkpoint.completed) {
    const completedAge = formatCheckpointAge(checkpoint.completedAt);
    const duration = getCheckpointDuration(
      checkpoint.startedAt,
      checkpoint.completedAt,
    );
    return [
      `Completed ${completedAge ?? ""}`.trim(),
      duration ? `Took ${duration}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (checkpoint.started) {
    return `Started ${formatCheckpointAge(checkpoint.startedAt) ?? "recently"}`;
  }

  return "Not started";
}

function getCheckpointTargetText(checkpoint: GoalCheckpoint) {
  if (!checkpoint.targetDate) return "No target date";
  const isOverdue =
    !checkpoint.completed && checkpoint.targetDate < todayDateKey();
  return `${isOverdue ? "Overdue" : "Target"} ${formatCheckpointDate(
    checkpoint.targetDate,
  )}`;
}

function formatCheckpointAge(timestamp: string | null) {
  if (!timestamp) return null;
  const timestampDate = new Date(timestamp);
  if (Number.isNaN(timestampDate.getTime())) return null;

  const days = Math.max(
    0,
    Math.floor((Date.now() - timestampDate.getTime()) / 86_400_000),
  );
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function getCheckpointDuration(
  startedAt: string | null,
  completedAt: string | null,
) {
  if (!startedAt || !completedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  const days = Math.floor((end - start) / 86_400_000);
  if (days === 0) return "less than a day";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function GoalDetailModal({
  goal,
  habits,
  habitEvidenceByDate,
  habitProgressById,
  tasks,
  onClose,
  onPressHabit,
  onPressCheckpoint,
}: {
  goal: Goal | null;
  habits: Habit[];
  habitEvidenceByDate: HabitEvidenceByDate;
  habitProgressById: HabitProgressById;
  tasks: Task[];
  onClose: () => void;
  onPressHabit: (habit: Habit) => void;
  onPressCheckpoint: (goal: Goal, checkpoint: GoalCheckpoint) => void;
}) {
  const theme = useTheme();
  const [linkedHabitPhotos, setLinkedHabitPhotos] = useState<GoalPhoto[]>([]);
  const [selectedLinkedHabitPhoto, setSelectedLinkedHabitPhoto] =
    useState<GoalPhoto | null>(null);
  const [detailHabitProgressById, setDetailHabitProgressById] =
    useState(habitProgressById);
  const [detailHabitEvidenceByDate, setDetailHabitEvidenceByDate] =
    useState(habitEvidenceByDate);
  const linkedHabitIdsForFetch = (goal?.links ?? [])
    .filter((link) => link.sourceType === "habit")
    .map((link) => link.sourceId);
  const linkedHabitIdsKey = linkedHabitIdsForFetch.join("|");

  useEffect(() => {
    setDetailHabitProgressById(habitProgressById);
    setDetailHabitEvidenceByDate(habitEvidenceByDate);
  }, [habitEvidenceByDate, habitProgressById]);

  useEffect(() => {
    let cancelled = false;
    setLinkedHabitPhotos([]);
    setSelectedLinkedHabitPhoto(null);
    if (!goal || !linkedHabitIdsKey) return;
    const linkedHabitIds = linkedHabitIdsKey.split("|");

    const startDateKey = goal.checkpoints.reduce((earliest, checkpoint) => {
      const checkpointStart = timestampToDateKey(
        checkpoint.startedAt ?? checkpoint.createdAt,
      );
      return checkpointStart < earliest ? checkpointStart : earliest;
    }, timestampToDateKey(goal.createdAt));
    const endDateKey = todayDateKey();

    void Promise.all([
      fetchAllHabitLogsSnapshot().catch(() => null),
      Promise.all(
        linkedHabitIds.map((habitId) =>
          fetchGoalPhotosForRange(habitId, startDateKey, endDateKey),
        ),
      ),
    ])
      .then(([snapshot, photoGroups]) => {
        if (cancelled) return;
        if (snapshot) {
          setDetailHabitProgressById(buildHabitProgressById([snapshot]));
          setDetailHabitEvidenceByDate(buildHabitEvidenceByDate([snapshot]));
        }
        setLinkedHabitPhotos(photoGroups.flat());
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [goal, linkedHabitIdsKey]);

  if (!goal) return null;

  type LinkedGoalItem = {
    icon: ReturnType<typeof symbol>;
    id: string;
    kind: "Task" | "Habit";
    title: string;
  };
  const links = goal.links ?? [];
  const linkedItems = links
    .flatMap((link): LinkedGoalItem[] => {
      if (link.sourceType === "task") {
        const task = tasks.find((item) => item.id === link.sourceId);
        return task && !task.completedAt
          ? [
              {
                icon: symbol("checklist", "checklist"),
                id: link.sourceId,
                kind: "Task" as const,
                title: task.name,
              },
            ]
          : [];
      }

      const habit = habits.find((item) => item.id === link.sourceId);
      return habit
        ? [
            {
              icon: symbol("repeat", "repeat"),
              id: link.sourceId,
              kind: "Habit" as const,
              title: habit.name,
            },
          ]
        : [];
    })
    .sort((left, right) => {
      if (left.kind === right.kind) return 0;
      return left.kind === "Task" ? -1 : 1;
    });
  const linkedHabitIds = links
    .filter((link) => link.sourceType === "habit")
    .map((link) => link.sourceId);
  const getLinkedHabitEvidence = (checkpoint: GoalCheckpoint) => {
    if (!checkpoint.started && !checkpoint.completed) {
      return { hasNote: false, hasPhoto: false, noteText: null, photos: [] };
    }

    const startDateKey = timestampToDateKey(
      checkpoint.startedAt ?? checkpoint.createdAt,
    );
    const endDateKey = checkpoint.completedAt
      ? timestampToDateKey(checkpoint.completedAt)
      : todayDateKey();
    const evidence: {
      hasNote: boolean;
      hasPhoto: boolean;
      noteText: string | null;
      photos: GoalPhoto[];
    } = { hasNote: false, hasPhoto: false, noteText: null, photos: [] };

    for (const habitId of linkedHabitIds) {
      for (const dateKey of detailHabitProgressById[habitId] ?? []) {
        if (dateKey < startDateKey || dateKey > endDateKey) continue;
        const habitEvidence =
          detailHabitEvidenceByDate[`${habitId}_${dateKey}`];
        if (habitEvidence) {
          evidence.hasNote ||= habitEvidence.hasNote;
          evidence.noteText ??= habitEvidence.noteText;
        }
        const photos = linkedHabitPhotos.filter(
          (photo) => photo.goalId === habitId && photo.dateKey === dateKey,
        );
        evidence.photos.push(...photos);
        evidence.hasPhoto ||= photos.length > 0;
      }
    }

    return evidence;
  };
  const activeCheckpoint =
    goal.checkpoints.find(
      (checkpoint) => checkpoint.started && !checkpoint.completed,
    ) ?? null;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ backgroundColor: theme.background, flex: 1 }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.tabBar,
          borderBottomColor: theme.tabBorder,
          borderBottomWidth: StyleSheet.hairlineWidth,
          flexDirection: "row",
          gap: 12,
          justifyContent: "space-between",
          minHeight: 62,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[
              {
                color: theme.text,
                fontSize: 18,
                fontWeight: "800",
                lineHeight: 24,
              },
            ]}
          >
            {goal.title}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close"
          hitSlop={8}
          onPress={onClose}
          style={({ pressed }) => [
            modalStyles.closeBtn,
            {
              backgroundColor: theme.backgroundElement,
              flexShrink: 0,
            },
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={symbol("xmark", "close")}
            size={14}
            weight="bold"
            tintColor={theme.tabIcon}
          />
        </Pressable>
      </View>

      <ScrollView
        canCancelContentTouches
        contentContainerStyle={modalStyles.actions}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 10 }}>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: 14,
              fontWeight: "700",
            }}
          >
            Linked tasks and habits
          </Text>
          {linkedItems.length ? (
            <View style={{ gap: 10, paddingLeft: 6 }}>
              {linkedItems.map((item) =>
                item.kind === "Habit" ? (
                  <Pressable
                    accessibilityLabel={`Open ${item.title} habit actions`}
                    accessibilityRole="button"
                    key={`${item.kind}:${item.id}`}
                    onPress={() => {
                      const habit = habits.find(
                        (candidate) => candidate.id === item.id,
                      );
                      if (habit) onPressHabit(habit);
                    }}
                    style={({ pressed }) => [
                      { gap: 5 },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={{
                        alignItems: "center",
                        flexDirection: "row",
                        gap: 8,
                        minHeight: 28,
                      }}
                    >
                      <SymbolView
                        name={item.icon}
                        size={16}
                        tintColor={theme.primary}
                      />
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.text,
                          flex: 1,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        {item.title}
                      </Text>
                      <Text
                        style={{ color: theme.textSecondary, fontSize: 11 }}
                      >
                        Habit
                      </Text>
                    </View>
                    {activeCheckpoint ? (
                      <HabitProgressGrid
                        completedDates={habitProgressById[item.id] ?? []}
                        goalCreatedAt={goal.createdAt}
                        checkpointCreatedAt={activeCheckpoint.createdAt}
                        checkpointCompletedAt={activeCheckpoint.completedAt}
                      />
                    ) : null}
                  </Pressable>
                ) : (
                  <View
                    key={`${item.kind}:${item.id}`}
                    style={{
                      alignItems: "center",
                      flexDirection: "row",
                      gap: 8,
                      minHeight: 28,
                    }}
                  >
                    <SymbolView
                      name={item.icon}
                      size={16}
                      tintColor={theme.primary}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        color: theme.text,
                        flex: 1,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {item.title}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                      Task
                    </Text>
                  </View>
                ),
              )}
            </View>
          ) : (
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              No tasks or habits linked.
            </Text>
          )}
        </View>

        <View
          style={{
            borderTopColor: theme.tabBorder,
            borderTopWidth: StyleSheet.hairlineWidth,
            gap: 10,
            paddingTop: 18,
          }}
        >
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: 14,
              fontWeight: "700",
            }}
          >
            Checkpoints
          </Text>
          {goal.checkpoints.map((checkpoint, index) => {
            const linkedHabitEvidence = getLinkedHabitEvidence(checkpoint);

            return (
              <View
                key={checkpoint.id}
                style={{
                  gap: 10,
                  borderTopColor: theme.tabBorder,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  paddingTop: index === 0 ? 0 : 14,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Pressable
                    accessibilityLabel={
                      checkpoint.completed
                        ? `${checkpoint.title} completed`
                        : checkpoint.started
                          ? `Complete ${checkpoint.title}`
                          : `Start ${checkpoint.title}`
                    }
                    accessibilityRole="button"
                    disabled={checkpoint.completed}
                    onPress={() => onPressCheckpoint(goal, checkpoint)}
                    style={{
                      alignItems: "center",
                      backgroundColor: checkpoint.completed
                        ? theme.primary
                        : checkpoint.started
                          ? `${theme.primary}26`
                          : theme.backgroundElement,
                      borderColor: checkpoint.completed
                        ? theme.primary
                        : checkpoint.started
                          ? theme.primary
                          : theme.tabBorder,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      height: 28,
                      justifyContent: "center",
                      width: 28,
                    }}
                  >
                    {checkpoint.completed ? (
                      <SymbolView
                        name={symbol("checkmark", "check")}
                        size={14}
                        tintColor={theme.primaryForeground}
                        weight="bold"
                      />
                    ) : checkpoint.started ? (
                      <SymbolView
                        name={symbol("play.fill", "play_arrow")}
                        size={12}
                        tintColor={theme.primary}
                        weight="bold"
                      />
                    ) : null}
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 18,
                        fontWeight: "700",
                      }}
                    >
                      {checkpoint.title}
                    </Text>
                    <View style={{ gap: 3, marginTop: 2 }}>
                      <Text
                        style={{ color: theme.textSecondary, fontSize: 12 }}
                      >
                        {getCheckpointDetailText(checkpoint)}
                      </Text>
                      <View
                        style={{
                          alignItems: "center",
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 7,
                        }}
                      >
                        {getCheckpointTargetText(checkpoint) ? (
                          <Text
                            style={{
                              color:
                                !checkpoint.completed &&
                                Boolean(
                                  checkpoint.targetDate &&
                                    checkpoint.targetDate < todayDateKey(),
                                )
                                  ? theme.primary
                                  : theme.textSecondary,
                              fontSize: 12,
                            }}
                          >
                            {getCheckpointTargetText(checkpoint)}
                          </Text>
                        ) : null}
                      </View>
                      {linkedHabitEvidence.noteText ? (
                        <View
                          style={{
                            backgroundColor: theme.backgroundElement,
                            borderRadius: 8,
                            marginTop: 7,
                            paddingHorizontal: 9,
                            paddingVertical: 7,
                          }}
                        >
                          <Text
                            numberOfLines={4}
                            style={{
                              color: theme.text,
                              fontSize: 12,
                              lineHeight: 17,
                            }}
                          >
                            {richTextToPlainText(linkedHabitEvidence.noteText)}
                          </Text>
                        </View>
                      ) : null}
                      {linkedHabitEvidence.photos.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={{ marginTop: 7 }}
                        >
                          {linkedHabitEvidence.photos.map((photo) => (
                            <Pressable
                              accessibilityLabel="Open linked habit photo"
                              accessibilityRole="button"
                              key={photo.id}
                              onPress={() => setSelectedLinkedHabitPhoto(photo)}
                              style={({ pressed }) => [
                                {
                                  borderRadius: 8,
                                  marginRight: 7,
                                  overflow: "hidden",
                                },
                                pressed && styles.pressed,
                              ]}
                            >
                              <Image
                                contentFit="cover"
                                source={{ uri: photo.url }}
                                style={{
                                  backgroundColor: theme.backgroundElement,
                                  height: 78,
                                  width: 96,
                                }}
                                transition={180}
                              />
                            </Pressable>
                          ))}
                        </ScrollView>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedLinkedHabitPhoto(null)}
        statusBarTranslucent
        transparent
        visible={Boolean(selectedLinkedHabitPhoto)}
      >
        <View
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.96)",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <Pressable
            accessibilityLabel="Close linked habit photo"
            onPress={() => setSelectedLinkedHabitPhoto(null)}
            style={StyleSheet.absoluteFill}
          />
          {selectedLinkedHabitPhoto ? (
            <Image
              contentFit="contain"
              source={{ uri: selectedLinkedHabitPhoto.url }}
              style={{ height: "100%", width: "100%" }}
            />
          ) : null}
          <Pressable
            accessibilityLabel="Close linked habit photo"
            accessibilityRole="button"
            onPress={() => setSelectedLinkedHabitPhoto(null)}
            style={({ pressed }) => [
              {
                alignItems: "center",
                backgroundColor: theme.backgroundElement,
                borderRadius: 22,
                height: 44,
                justifyContent: "center",
                position: "absolute",
                right: 18,
                top: 48,
                width: 44,
              },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={symbol("xmark", "close")}
              size={20}
              tintColor={theme.text}
            />
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function LinkGoalModal({
  goal,
  embedded = false,
  habits,
  linkUpdatingKey,
  tasks,
  onClose,
  onToggleLink,
}: {
  goal: Goal | null;
  embedded?: boolean;
  habits: Habit[];
  linkUpdatingKey: string | null;
  tasks: Task[];
  onClose: () => void;
  onToggleLink: ToggleGoalLink;
}) {
  const theme = useTheme();
  if (!goal) return null;

  const links = goal.links ?? [];
  const linkedTaskIds = new Set(
    links
      .filter((link) => link.sourceType === "task")
      .map((link) => link.sourceId),
  );
  const linkedHabitIds = new Set(
    links
      .filter((link) => link.sourceType === "habit")
      .map((link) => link.sourceId),
  );
  const visibleTasks = tasks.filter(
    (task) => !task.completedAt || linkedTaskIds.has(task.id),
  );
  const visibleHabits = habits.filter(
    (habit) => !habit.hidden || linkedHabitIds.has(habit.id),
  );

  const content = (
    <View style={modalStyles.overlay}>
      <Pressable
        accessibilityLabel="Close link picker"
        style={[StyleSheet.absoluteFill, modalStyles.backdrop]}
        onPress={onClose}
      />
      <SafeAreaView
        edges={["bottom"]}
        style={[modalStyles.sheet, { backgroundColor: theme.background }]}
      >
        <View
          style={[
            modalStyles.header,
            {
              backgroundColor: theme.tabBar,
              borderBottomColor: theme.tabBorder,
            },
          ]}
        >
          <View style={modalStyles.titleBlock}>
            <Text style={[modalStyles.title, { color: theme.text }]}>
              Link to {goal.title}
            </Text>
            <Text
              style={[modalStyles.subtitle, { color: theme.textSecondary }]}
            >
              Choose tasks or habits for this goal
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [
              modalStyles.closeBtn,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={symbol("xmark", "close")}
              size={14}
              weight="bold"
              tintColor={theme.tabIcon}
            />
          </Pressable>
        </View>

        <ScrollView
          canCancelContentTouches
          contentContainerStyle={modalStyles.actions}
          showsVerticalScrollIndicator={false}
        >
          <LinkOptionGroup
            emptyLabel="No active tasks available."
            icon={symbol("checklist", "checklist")}
            label="Tasks"
            options={visibleTasks.map((task) => ({
              id: task.id,
              subtitle: [task.importance, task.timeRequired]
                .filter(Boolean)
                .join(" · "),
              title: task.name,
            }))}
            updatingKey={linkUpdatingKey}
            sourceType="task"
            linkedIds={linkedTaskIds}
            goal={goal}
            onToggle={onToggleLink}
          />
          <LinkOptionGroup
            emptyLabel="No visible habits available."
            icon={symbol("repeat", "repeat")}
            label="Habits"
            options={visibleHabits.map((habit) => ({
              id: habit.id,
              subtitle: [habit.categoryName, habit.period]
                .filter(Boolean)
                .join(" · "),
              title: habit.name,
            }))}
            updatingKey={linkUpdatingKey}
            sourceType="habit"
            linkedIds={linkedHabitIds}
            goal={goal}
            onToggle={onToggleLink}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );

  return embedded ? (
    <View style={StyleSheet.absoluteFill}>{content}</View>
  ) : (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

function LinkOptionGroup({
  goal,
  emptyLabel,
  icon,
  label,
  linkedIds,
  onToggle,
  options,
  sourceType,
  updatingKey,
}: {
  goal: Goal;
  emptyLabel: string;
  icon: SymbolName;
  label: string;
  linkedIds: Set<string>;
  onToggle: ToggleGoalLink;
  options: Array<{ id: string; subtitle: string; title: string }>;
  sourceType: "task" | "habit";
  updatingKey: string | null;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <SymbolView name={icon} size={16} tintColor={theme.primary} />
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: 14,
            fontWeight: "700",
          }}
        >
          {label}
        </Text>
      </View>
      {options.length ? (
        options.map((option) => {
          const linked = linkedIds.has(option.id);
          const isUpdating =
            updatingKey === `${goal.id}:${sourceType}:${option.id}`;
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: linked,
                disabled: Boolean(updatingKey),
              }}
              disabled={Boolean(updatingKey)}
              key={option.id}
              onPress={() => onToggle(goal, sourceType, option.id)}
              style={({ pressed }) => [
                {
                  alignItems: "center",
                  backgroundColor: linked
                    ? `${theme.primary}14`
                    : theme.backgroundElement,
                  borderColor: linked ? theme.primary : theme.tabBorder,
                  borderRadius: 12,
                  borderWidth: StyleSheet.hairlineWidth,
                  flexDirection: "row",
                  gap: 10,
                  minHeight: 48,
                  paddingHorizontal: 12,
                },
                pressed && styles.pressed,
              ]}
            >
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: linked ? theme.primary : "transparent",
                  borderColor: linked ? theme.primary : theme.tabBorder,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  height: 20,
                  justifyContent: "center",
                  width: 20,
                }}
              >
                {isUpdating ? (
                  <ActivityIndicator
                    color={theme.primaryForeground}
                    size="small"
                  />
                ) : linked ? (
                  <SymbolView
                    name={symbol("checkmark", "check")}
                    size={12}
                    tintColor={theme.primaryForeground}
                    weight="bold"
                  />
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}
                >
                  {option.title}
                </Text>
                {option.subtitle ? (
                  <Text
                    numberOfLines={1}
                    style={{ color: theme.textSecondary, fontSize: 12 }}
                  >
                    {option.subtitle}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })
      ) : (
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
          {emptyLabel}
        </Text>
      )}
    </View>
  );
}

export function CheckpointActionsModal({
  active,
  plannedEvent,
  onClearPlan,
  onClose,
  onEditGoal,
  onCompleted,
  onPlan,
  onSaved,
  onError,
}: {
  active: ActiveCheckpoint | null;
  plannedEvent?: PlannedEvent | null;
  onClearPlan?: (active: ActiveCheckpoint) => void;
  onClose: () => void;
  onEditGoal?: (goal: Goal) => void;
  onCompleted: (updatedGoal: Goal | null, checkpointId: string) => void;
  onPlan?: (active: ActiveCheckpoint) => void;
  onSaved: (updatedGoal: Goal | null) => void;
  onError: (message: string | null) => void;
}) {
  const theme = useTheme();
  const [completed, setCompleted] = useState(false);
  const [started, setStarted] = useState(false);
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<GoalVisibility>("only_me");
  const [photoCount, setPhotoCount] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [uploadingSource, setUploadingSource] =
    useState<GoalPhotoSource | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const activeCheckpointIdRef = useRef<string | null>(null);

  const checkpointId = active?.checkpoint.id ?? null;

  useEffect(() => {
    if (!active) {
      activeCheckpointIdRef.current = null;
      setIsUpdating(false);
      setUploadingSource(null);
      return;
    }
    activeCheckpointIdRef.current = active.checkpoint.id;
    setStarted(active.checkpoint.started);
    setCompleted(active.checkpoint.completed);
    setNote(active.checkpoint.notes ?? "");
    setVisibility(
      active.checkpoint.visibility === "all_friends"
        ? "all_friends"
        : "only_me",
    );
    setPhotoCount(0);
    setNoteOpen(false);
    setIsUpdating(false);
    setUploadingSource(null);

    let cancelled = false;
    fetchCheckpointPhotos(active.checkpoint.id)
      .then((rows) => {
        if (
          !cancelled &&
          activeCheckpointIdRef.current === active.checkpoint.id
        ) {
          setPhotoCount(rows.length);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active]);

  if (!active) return null;
  const { checkpoint, goal } = active;
  const hasContent = note.trim().length > 0 || photoCount > 0;

  const save = async (next: {
    started: boolean;
    completed: boolean;
    notes: string | null;
    visibility: GoalVisibility;
  }) => {
    if (!checkpointId) return;
    onError(null);
    setIsUpdating(true);
    try {
      const updatedGoal = await updatePlanGoalCheckpoint(checkpointId, next);
      if (activeCheckpointIdRef.current !== checkpointId) return;
      setCompleted(next.completed);
      setStarted(next.started);
      setVisibility(next.visibility);
      setNote(next.notes ?? "");
      onSaved(updatedGoal);
      if (!completed && next.completed) {
        playSuccessHaptic();
        onCompleted(updatedGoal, checkpoint.id);
      }
    } catch (err) {
      if (activeCheckpointIdRef.current !== checkpointId) return;
      onError(
        err instanceof Error ? err.message : "Could not update checkpoint.",
      );
    } finally {
      if (activeCheckpointIdRef.current === checkpointId) {
        setIsUpdating(false);
      }
    }
  };

  const addPhoto = async (source: GoalPhotoSource) => {
    if (!checkpointId || uploadingSource) return;
    onError(null);
    setUploadingSource(source);
    try {
      const picked = await pickGoalPhoto(source);
      if (picked) {
        await uploadCheckpointPhoto(checkpointId, picked);
        if (activeCheckpointIdRef.current !== checkpointId) return;
        setPhotoCount((current) => current + 1);
      }
    } catch (err) {
      if (activeCheckpointIdRef.current !== checkpointId) return;
      onError(err instanceof Error ? err.message : "Could not add photo.");
    } finally {
      if (activeCheckpointIdRef.current === checkpointId) {
        setUploadingSource(null);
      }
    }
  };

  const notes = () => (note.trim() ? note.trim() : null);
  const isUploadingPhoto = uploadingSource !== null;

  return (
    <Modal
      animationType="slide"
      transparent
      statusBarTranslucent
      visible
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <Pressable
          accessibilityLabel="Close"
          style={[StyleSheet.absoluteFill, modalStyles.backdrop]}
          onPress={onClose}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[modalStyles.sheet, { backgroundColor: theme.background }]}
        >
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
              {checkpoint.title}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [
                modalStyles.closeBtn,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={symbol("xmark", "close")}
                size={14}
                weight="bold"
                tintColor={theme.tabIcon}
              />
            </Pressable>
          </View>

          <ScrollView
            canCancelContentTouches
            contentContainerStyle={modalStyles.actions}
            directionalLockEnabled
            showsVerticalScrollIndicator={false}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.checkpointGoalLabel,
                { color: theme.textSecondary },
              ]}
            >
              {goal.title}
            </Text>

            <Pressable
              onPress={() =>
                void save({
                  started: completed ? true : !started,
                  completed: completed ? false : started,
                  notes: notes(),
                  visibility,
                })
              }
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
                    completed
                      ? symbol("arrow.uturn.backward.circle.fill", "undo")
                      : started
                        ? symbol("checkmark.circle.fill", "check_circle")
                        : symbol("play.circle.fill", "play_circle")
                  }
                  size={26}
                  tintColor={completed ? theme.textSecondary : theme.primary}
                />
              )}
              <Text style={[modalStyles.actionText, { color: theme.text }]}>
                {completed
                  ? "Reopen checkpoint"
                  : started
                    ? "Mark complete"
                    : "Start checkpoint"}
              </Text>
            </Pressable>

            {onPlan ? (
              <Pressable
                onPress={() => onPlan(active)}
                style={({ pressed }) => [
                  modalStyles.actionRow,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={symbol("calendar.badge.plus", "event_available")}
                  size={26}
                  tintColor={theme.secondary}
                />
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  {plannedEvent ? "Edit calendar plan" : "Plan to calendar"}
                </Text>
              </Pressable>
            ) : null}

            {plannedEvent && onClearPlan ? (
              <Pressable
                onPress={() => onClearPlan(active)}
                style={({ pressed }) => [
                  modalStyles.actionRow,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={symbol("calendar.badge.minus", "event_busy")}
                  size={26}
                  tintColor={theme.textSecondary}
                />
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  Clear calendar plan
                </Text>
              </Pressable>
            ) : null}

            <View style={modalStyles.photoRow}>
              <Pressable
                disabled={isUploadingPhoto}
                onPress={() => void addPhoto("camera")}
                style={({ pressed }) => [
                  modalStyles.photoBtn,
                  { backgroundColor: theme.backgroundElement },
                  isUploadingPhoto && modalStyles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {uploadingSource === "camera" ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <SymbolView
                    name={symbol("camera.fill", "camera_alt")}
                    size={26}
                    tintColor={theme.primary}
                  />
                )}
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  Take photo
                </Text>
              </Pressable>
              <Pressable
                disabled={isUploadingPhoto}
                onPress={() => void addPhoto("library")}
                style={({ pressed }) => [
                  modalStyles.photoBtn,
                  { backgroundColor: theme.backgroundElement },
                  isUploadingPhoto && modalStyles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {uploadingSource === "library" ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <SymbolView
                    name={symbol("photo.fill", "photo_library")}
                    size={26}
                    tintColor={theme.primary}
                  />
                )}
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  Add photo
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setNoteOpen((current) => !current)}
              style={({ pressed }) => [
                modalStyles.actionRow,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={symbol("note.text", "notes")}
                size={26}
                tintColor={theme.primary}
              />
              <View style={modalStyles.noteRowContent}>
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  {note.trim() ? "Edit note" : "Add note"}
                </Text>
                {note.trim() && !noteOpen ? (
                  <Text
                    numberOfLines={3}
                    style={[
                      modalStyles.notePreview,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {note.trim()}
                  </Text>
                ) : null}
              </View>
            </Pressable>

            {noteOpen ? (
              <View
                style={[
                  modalStyles.planTimeSection,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <TextInput
                  multiline
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note about this milestone…"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.checkpointNoteInput,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.tabBorder,
                      color: theme.text,
                    },
                  ]}
                  textAlignVertical="top"
                />
                <Pressable
                  disabled={isUpdating}
                  onPress={() =>
                    void save({
                      started,
                      completed,
                      notes: notes(),
                      visibility,
                    }).then(() => setNoteOpen(false))
                  }
                  style={[
                    styles.checkpointSaveButton,
                    { backgroundColor: theme.primary, marginTop: 10 },
                  ]}
                >
                  {isUpdating ? (
                    <ActivityIndicator color={theme.primaryForeground} />
                  ) : (
                    <Text
                      style={[
                        styles.checkpointSaveText,
                        { color: theme.primaryForeground },
                      ]}
                    >
                      Save note
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {hasContent ? (
              <GoalLogVisibilityControl
                disabled={isUpdating}
                value={visibility}
                onChange={(next) =>
                  void save({
                    started,
                    completed,
                    notes: notes(),
                    visibility: next,
                  })
                }
                allowed={["only_me", "all_friends"]}
                label="Checkpoint visibility"
              />
            ) : null}

            {onEditGoal ? (
              <Pressable
                onPress={() => onEditGoal(goal)}
                style={({ pressed }) => [
                  modalStyles.actionRow,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={symbol("pencil", "edit")}
                  size={26}
                  tintColor={theme.tabIcon}
                />
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  Edit goal
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function CheckpointPlanModal({
  active,
  existingPlan,
  onClose,
  onSave,
}: {
  active: ActiveCheckpoint | null;
  existingPlan?: PlannedEvent | null;
  onClose: () => void;
  onSave: (input: {
    dateKey: string;
    endTime: string | null;
    startTime: string | null;
    timeZone: string | null;
  }) => Promise<void>;
}) {
  const theme = useTheme();
  const [dateKey, setDateKey] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [startPeriod, setStartPeriod] = useState<PlanPeriod>("AM");
  const [endPeriod, setEndPeriod] = useState<PlanPeriod>("AM");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedStartTime = normalizePlanTimeInput(startTime, startPeriod);
  const normalizedEndTime = normalizePlanTimeInput(endTime, endPeriod);
  const hasAnyTimeInput = Boolean(startTime.trim() || endTime.trim());
  const hasValidTimeRange = Boolean(normalizedStartTime && normalizedEndTime);
  const trimmedDateKey = dateKey.trim();
  const dateIsValid = Boolean(parseDateKeyParts(trimmedDateKey));
  const canSave = Boolean(
    active && dateIsValid && (!hasAnyTimeInput || hasValidTimeRange),
  );
  const timeZone = useMemo(() => getLocalTimeZone(), []);

  useEffect(() => {
    if (!active) return;

    const start = getPlanTimeInput(existingPlan?.startTime);
    const end = getPlanTimeInput(existingPlan?.endTime);
    setDateKey(
      existingPlan?.date ?? active.checkpoint.targetDate ?? todayDateKey(),
    );
    setStartTime(start.time);
    setEndTime(end.time);
    setStartPeriod(start.period);
    setEndPeriod(end.period);
    setError(null);
  }, [active, existingPlan]);

  const save = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        dateKey: trimmedDateKey,
        endTime: hasValidTimeRange ? normalizedEndTime : null,
        startTime: hasValidTimeRange ? normalizedStartTime : null,
        timeZone,
      });
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save plan.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!active) return null;

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.planSheet, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              styles.planSheetHeader,
              {
                backgroundColor: theme.tabBar,
                borderBottomColor: theme.tabBorder,
              },
            ]}
          >
            <View style={styles.planSheetTitleBlock}>
              <Text style={[styles.planSheetTitle, { color: theme.text }]}>
                {existingPlan ? "Edit calendar plan" : "Plan to calendar"}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.planSheetSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                {active.checkpoint.title}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={symbol("xmark", "close")}
                size={14}
                weight="bold"
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>
          <View style={styles.planSheetContent}>
            <View style={styles.inputField}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Date
              </Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                onChangeText={setDateKey}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
                selectionColor={theme.primary}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                    color: theme.text,
                  },
                ]}
                value={dateKey}
              />
            </View>
            <View style={styles.planTimeGrid}>
              <CheckpointPlanTimeField
                label="Start"
                period={startPeriod}
                value={startTime}
                onChangePeriod={setStartPeriod}
                onChangeText={setStartTime}
              />
              <CheckpointPlanTimeField
                label="End"
                period={endPeriod}
                value={endTime}
                onChangePeriod={setEndPeriod}
                onChangeText={setEndTime}
              />
            </View>
            {hasAnyTimeInput && !hasValidTimeRange ? (
              <Text style={styles.formError}>
                Add both start and end times like 9:00.
              </Text>
            ) : null}
            {trimmedDateKey && !dateIsValid ? (
              <Text style={styles.formError}>Use date format YYYY-MM-DD.</Text>
            ) : null}
            {error ? <Text style={styles.formError}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={!canSave || isSaving}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.planSaveButton,
                { backgroundColor: canSave ? theme.primary : theme.tabBorder },
                pressed && styles.pressed,
              ]}
            >
              {isSaving ? (
                <ActivityIndicator
                  color={theme.primaryForeground}
                  size="small"
                />
              ) : (
                <Text
                  style={[
                    styles.planSaveButtonText,
                    { color: theme.primaryForeground },
                  ]}
                >
                  Save plan
                </Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function CheckpointPlanTimeField({
  label,
  onChangePeriod,
  onChangeText,
  period,
  value,
}: {
  label: string;
  onChangePeriod: (period: PlanPeriod) => void;
  onChangeText: (value: string) => void;
  period: PlanPeriod;
  value: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.inputField, styles.planTimeField]}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <TextInput
        keyboardType="numbers-and-punctuation"
        onChangeText={onChangeText}
        placeholder="9:00"
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.primary}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
            color: theme.text,
          },
        ]}
        value={value}
      />
      <View style={styles.planPeriodRow}>
        {PLAN_PERIODS.map((option) => {
          const selected = period === option;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option}
              onPress={() => {
                playSelectionHaptic();
                onChangePeriod(option);
              }}
              style={({ pressed }) => [
                styles.planPeriodChip,
                {
                  backgroundColor: selected
                    ? theme.primary
                    : theme.backgroundElement,
                  borderColor: selected ? theme.primary : theme.tabBorder,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.planPeriodLabel,
                  {
                    color: selected
                      ? theme.primaryForeground
                      : theme.textSecondary,
                  },
                ]}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function LaterGoalsToggle({
  count,
  expanded,
  label = "later",
  onPress,
}: {
  count: number;
  expanded: boolean;
  label?: "later" | "completed";
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.laterGoalsToggle,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.laterGoalsToggleText, { color: theme.text }]}>
        {expanded ? `Hide ${label} goals` : `Show ${label} goals (${count})`}
      </Text>
      <SymbolView
        name={symbol(
          expanded ? "chevron.up" : "chevron.down",
          expanded ? "keyboard_arrow_up" : "keyboard_arrow_down",
        )}
        size={18}
        weight="semibold"
        tintColor={theme.textSecondary}
      />
    </Pressable>
  );
}

function EmptyState({
  hasGoals,
  onAdd,
  query,
}: {
  hasGoals: boolean;
  onAdd: () => void;
  query: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.centerState}>
      {hasGoals ? (
        <>
          <View
            style={[
              styles.emptyIcon,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <SymbolView
              name={symbol("magnifyingglass", "search")}
              size={28}
              tintColor={theme.primary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            No goals found
          </Text>
          <Text
            style={[styles.emptyDescription, { color: theme.textSecondary }]}
          >
            {`Nothing matched "${query.trim()}".`}
          </Text>
        </>
      ) : (
        <BrandedEmptyState
          title="Create your first goal"
          description="Goals are bigger outcomes. Checkpoints are the habits and tasks that move you forward."
        />
      )}
      {!hasGoals ? (
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [
            styles.emptyButton,
            { backgroundColor: theme.primary },
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.emptyButtonLabel,
              { color: theme.primaryForeground },
            ]}
          >
            Add goal
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function GoalFormModal({
  goal,
  habits = [],
  initialValues,
  isOpen,
  linkUpdatingKey = null,
  onClose,
  onArchive,
  onDelete,
  onUnarchive,
  onSave,
  onToggleLink = async () => null,
  saveHint,
  tasks = [],
}: {
  goal: Goal | null;
  habits?: Habit[];
  initialValues?: GoalInput;
  isOpen: boolean;
  linkUpdatingKey?: string | null;
  onClose: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onUnarchive?: () => void;
  onSave: (input: GoalInput) => Promise<void>;
  onToggleLink?: ToggleGoalLink;
  saveHint?: string;
  tasks?: Task[];
}) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [planOnCalendar, setPlanOnCalendar] = useState(false);
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>([]);
  const [goalLinks, setGoalLinks] = useState<Goal["links"]>([]);
  const [linkingGoalOpen, setLinkingGoalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(goal?.title ?? initialValues?.title ?? "");
    setColor(goal?.color ?? initialValues?.color ?? null);
    setPlanOnCalendar(
      goal?.planOnCalendar ?? initialValues?.planOnCalendar ?? false,
    );
    setCheckpoints(
      goal?.checkpoints.length
        ? goal.checkpoints.map((checkpoint) => ({
            localId: checkpoint.id,
            title: checkpoint.title,
            targetDate: checkpoint.targetDate ?? "",
            started: checkpoint.started,
            completed: checkpoint.completed,
          }))
        : initialValues?.checkpoints.length
          ? initialValues.checkpoints.map((checkpoint) => ({
              localId: createCheckpointLocalId(),
              title: checkpoint.title,
              targetDate: checkpoint.targetDate ?? "",
              started: checkpoint.started,
              completed: checkpoint.completed,
            }))
          : [createEmptyCheckpoint()],
    );
    setGoalLinks(goal?.links ?? []);
    setLinkingGoalOpen(false);
    setError(null);
  }, [goal, initialValues, isOpen]);

  const linkingGoal = goal ? { ...goal, links: goalLinks } : null;

  const handleToggleLink = async (
    linkedGoal: Goal,
    sourceType: "task" | "habit",
    sourceId: string,
  ) => {
    const updatedGoal = await onToggleLink(linkedGoal, sourceType, sourceId);
    if (updatedGoal) setGoalLinks(updatedGoal.links ?? []);
    return updatedGoal ?? null;
  };

  const updateCheckpoint = (
    localId: string,
    updates: Partial<Omit<CheckpointDraft, "localId">>,
  ) => {
    setCheckpoints((current) =>
      current.map((checkpoint) =>
        checkpoint.localId === localId
          ? { ...checkpoint, ...updates }
          : checkpoint,
      ),
    );
  };

  const removeCheckpoint = (localId: string) => {
    setCheckpoints((current) =>
      current.filter((checkpoint) => checkpoint.localId !== localId),
    );
  };

  const save = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSaving) return;

    const checkpointInput = checkpoints
      .map((checkpoint) => ({
        title: checkpoint.title.trim(),
        targetDate: checkpoint.targetDate.trim(),
        started: checkpoint.started,
        completed: checkpoint.completed,
      }))
      .filter((checkpoint) => checkpoint.title.length > 0);
    const derivedTiming = checkpointInput.some(
      (checkpoint) => checkpoint.started || checkpoint.completed,
    )
      ? "current"
      : "later";
    const invalidDate = checkpointInput.find(
      (checkpoint) =>
        checkpoint.targetDate.length > 0 &&
        !parseDateKeyParts(checkpoint.targetDate),
    );

    if (invalidDate) {
      setError("Checkpoint dates need to use YYYY-MM-DD.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        title: trimmedTitle,
        color,
        timing: derivedTiming,
        planOnCalendar,
        checkpoints: checkpointInput.map((checkpoint) => ({
          title: checkpoint.title,
          targetDate: checkpoint.targetDate || null,
          started: checkpoint.started,
          completed: checkpoint.completed,
        })),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save goal.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={isOpen}
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.formScreen, { backgroundColor: theme.background }]}
        >
          <SafeAreaView style={styles.formSafeArea}>
            <View
              style={[
                styles.formHeader,
                {
                  backgroundColor: theme.tabBar,
                  borderBottomColor: theme.tabBorder,
                },
              ]}
            >
              <Pressable onPress={onClose} style={styles.formHeaderButton}>
                <Text
                  style={[
                    styles.formHeaderButtonText,
                    { color: theme.primary },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Text style={[styles.formTitle, { color: theme.text }]}>
                {goal ? "Edit Goal" : "New Goal"}
              </Text>
              <Pressable
                disabled={!title.trim() || isSaving}
                onPress={() => void save()}
                style={styles.formHeaderButton}
              >
                {isSaving ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <Text
                    style={[
                      styles.formHeaderButtonText,
                      {
                        color: title.trim()
                          ? theme.primary
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
            {saveHint ? (
              <View
                style={[
                  styles.saveHint,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderBottomColor: theme.tabBorder,
                  },
                ]}
              >
                <Text style={[styles.saveHintText, { color: theme.text }]}>
                  {saveHint}
                </Text>
              </View>
            ) : null}

            <ScrollView
              canCancelContentTouches
              contentContainerStyle={styles.formContent}
              directionalLockEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.formSection}>
                <Text
                  style={[styles.sectionTitle, { color: theme.textSecondary }]}
                >
                  Goal
                </Text>
                <View
                  style={[
                    styles.sectionSurface,
                    {
                      backgroundColor: theme.tabBar,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  <View style={styles.inputField}>
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>
                      Title
                    </Text>
                    <TextInput
                      autoFocus
                      onChangeText={setTitle}
                      placeholder="What are you working toward?"
                      placeholderTextColor={theme.textSecondary}
                      returnKeyType="done"
                      selectionColor={theme.primary}
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.tabBorder,
                          color: theme.text,
                        },
                      ]}
                      value={title}
                    />
                  </View>
                  <CalendarColorPicker value={color} onChange={setColor} />
                  <View
                    style={[
                      styles.switchRow,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.tabBorder,
                      },
                    ]}
                  >
                    <View style={styles.switchCopy}>
                      <Text style={[styles.switchTitle, { color: theme.text }]}>
                        Add to calendar planner
                      </Text>
                      <Text
                        style={[
                          styles.switchDescription,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Show this goal's incomplete checkpoints as draggable
                        items when planning your schedule.
                      </Text>
                    </View>
                    <Switch
                      onValueChange={(value) => {
                        playSelectionHaptic();
                        setPlanOnCalendar(value);
                      }}
                      trackColor={{
                        false: theme.backgroundSelected,
                        true: theme.primary,
                      }}
                      value={planOnCalendar}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.formSection}>
                <Text
                  style={[styles.sectionTitle, { color: theme.textSecondary }]}
                >
                  Goal links
                </Text>
                <Pressable
                  accessibilityLabel={
                    goal
                      ? "Link tasks or habits to this goal"
                      : "Save the goal before linking tasks or habits"
                  }
                  accessibilityRole="button"
                  disabled={!goal}
                  onPress={() => setLinkingGoalOpen(true)}
                  style={({ pressed }) => [
                    {
                      alignItems: "center",
                      borderColor: theme.tabBorder,
                      borderRadius: 12,
                      borderWidth: StyleSheet.hairlineWidth,
                      flexDirection: "row",
                      gap: 8,
                      minHeight: 48,
                      paddingHorizontal: 12,
                    },
                    !goal && { opacity: 0.55 },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={symbol("link", "link")}
                    size={18}
                    tintColor={theme.primary}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 15,
                        fontWeight: "700",
                      }}
                    >
                      {goal ? "Link tasks or habits" : "Save goal to add links"}
                    </Text>
                    {goalLinks.length ? (
                      <Text
                        style={{ color: theme.textSecondary, fontSize: 12 }}
                      >
                        {goalLinks.length} linked
                      </Text>
                    ) : null}
                  </View>
                  {goal ? (
                    <SymbolView
                      name={symbol("chevron.right", "chevron_right")}
                      size={16}
                      tintColor={theme.textSecondary}
                    />
                  ) : null}
                </Pressable>
              </View>

              <View style={styles.formSection}>
                <Text
                  style={[styles.sectionTitle, { color: theme.textSecondary }]}
                >
                  Checkpoints
                </Text>
                <View
                  style={[
                    styles.sectionSurface,
                    {
                      backgroundColor: theme.tabBar,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  {checkpoints.map((checkpoint, index) => {
                    return (
                      <View
                        key={checkpoint.localId}
                        style={styles.checkpointRow}
                      >
                        <View style={styles.checkpointHeader}>
                          <Text
                            style={[
                              styles.checkpointNumber,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {index + 1}
                          </Text>
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{
                              checked: checkpoint.completed,
                              selected: checkpoint.started,
                            }}
                            onPress={() => {
                              playSelectionHaptic();
                              updateCheckpoint(checkpoint.localId, {
                                started: !checkpoint.completed,
                                completed: checkpoint.completed
                                  ? false
                                  : checkpoint.started,
                              });
                            }}
                            style={({ pressed }) => [
                              styles.checkpointToggle,
                              {
                                backgroundColor: checkpoint.completed
                                  ? theme.primary
                                  : checkpoint.started
                                    ? `${theme.primary}26`
                                    : theme.backgroundElement,
                                borderColor: checkpoint.completed
                                  ? theme.primary
                                  : checkpoint.started
                                    ? theme.primary
                                    : theme.tabBorder,
                              },
                              pressed && styles.pressed,
                            ]}
                          >
                            {checkpoint.completed ? (
                              <SymbolView
                                name={symbol("checkmark", "check")}
                                size={14}
                                weight="semibold"
                                tintColor={theme.primaryForeground}
                              />
                            ) : checkpoint.started ? (
                              <SymbolView
                                name={symbol("play.fill", "play_arrow")}
                                size={12}
                                tintColor={theme.primary}
                                weight="bold"
                              />
                            ) : null}
                          </Pressable>
                          <Pressable
                            accessibilityLabel="Remove checkpoint"
                            hitSlop={8}
                            onPress={() => removeCheckpoint(checkpoint.localId)}
                            style={({ pressed }) => [
                              styles.removeCheckpoint,
                              pressed && {
                                backgroundColor: theme.backgroundElement,
                              },
                            ]}
                          >
                            <SymbolView
                              name={symbol("minus.circle", "remove_circle")}
                              size={18}
                              tintColor={theme.textSecondary}
                            />
                          </Pressable>
                        </View>
                        <View style={styles.checkpointInputs}>
                          <TextInput
                            onChangeText={(checkpointTitle) =>
                              updateCheckpoint(checkpoint.localId, {
                                title: checkpointTitle,
                              })
                            }
                            placeholder="Checkpoint"
                            placeholderTextColor={theme.textSecondary}
                            selectionColor={theme.primary}
                            style={[
                              styles.input,
                              {
                                backgroundColor: theme.backgroundElement,
                                borderColor: theme.tabBorder,
                                color: theme.text,
                              },
                            ]}
                            value={checkpoint.title}
                          />
                          <TargetDateSelect
                            value={checkpoint.targetDate}
                            onChange={(targetDate) =>
                              updateCheckpoint(checkpoint.localId, {
                                targetDate,
                              })
                            }
                          />
                        </View>
                      </View>
                    );
                  })}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setCheckpoints((current) => [
                        ...current,
                        createEmptyCheckpoint(),
                      ])
                    }
                    style={({ pressed }) => [
                      styles.inlineAdd,
                      pressed && styles.pressed,
                    ]}
                  >
                    <SymbolView
                      name={symbol("plus.circle", "add_circle")}
                      size={18}
                      tintColor={theme.primary}
                    />
                    <Text
                      style={[styles.inlineAddLabel, { color: theme.primary }]}
                    >
                      Add checkpoint
                    </Text>
                  </Pressable>
                </View>
              </View>

              {goal && !goal.archivedAt && onArchive ? (
                <Pressable
                  accessibilityLabel={`Archive ${goal.title}`}
                  accessibilityRole="button"
                  onPress={onArchive}
                  style={({ pressed }) => [
                    {
                      alignItems: "center",
                      borderColor: theme.primary,
                      borderRadius: 12,
                      borderWidth: StyleSheet.hairlineWidth,
                      flexDirection: "row",
                      gap: 8,
                      justifyContent: "center",
                      marginTop: 16,
                      minHeight: 48,
                      paddingHorizontal: 12,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={symbol("archivebox", "archive")}
                    size={17}
                    tintColor={theme.primary}
                  />
                  <Text
                    style={{
                      color: theme.primary,
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
                    Archive goal
                  </Text>
                </Pressable>
              ) : null}

              {goal?.archivedAt && onUnarchive ? (
                <Pressable
                  accessibilityLabel={`Unarchive ${goal.title}`}
                  accessibilityRole="button"
                  onPress={onUnarchive}
                  style={({ pressed }) => [
                    {
                      alignItems: "center",
                      borderColor: theme.primary,
                      borderRadius: 12,
                      borderWidth: StyleSheet.hairlineWidth,
                      flexDirection: "row",
                      gap: 8,
                      justifyContent: "center",
                      marginTop: 16,
                      minHeight: 48,
                      paddingHorizontal: 12,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={symbol("arrow.uturn.left", "undo")}
                    size={17}
                    tintColor={theme.primary}
                  />
                  <Text
                    style={{
                      color: theme.primary,
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
                    Unarchive goal
                  </Text>
                </Pressable>
              ) : null}

              {goal?.archivedAt && onDelete ? (
                <Pressable
                  accessibilityLabel={`Delete ${goal.title}`}
                  accessibilityRole="button"
                  onPress={onDelete}
                  style={({ pressed }) => [
                    {
                      alignItems: "center",
                      borderColor: "#C94B58",
                      borderRadius: 12,
                      borderWidth: StyleSheet.hairlineWidth,
                      flexDirection: "row",
                      gap: 8,
                      justifyContent: "center",
                      marginTop: 12,
                      minHeight: 48,
                      paddingHorizontal: 12,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={symbol("trash", "delete")}
                    size={17}
                    tintColor="#C94B58"
                  />
                  <Text
                    style={{
                      color: "#C94B58",
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
                    Delete goal
                  </Text>
                </Pressable>
              ) : null}

              {error ? <Text style={styles.formError}>{error}</Text> : null}
            </ScrollView>
          </SafeAreaView>
          <LinkGoalModal
            embedded
            goal={linkingGoalOpen ? linkingGoal : null}
            habits={habits}
            linkUpdatingKey={linkUpdatingKey}
            tasks={tasks}
            onClose={() => setLinkingGoalOpen(false)}
            onToggleLink={handleToggleLink}
          />
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function createEmptyCheckpoint(): CheckpointDraft {
  return {
    localId: createCheckpointLocalId(),
    title: "",
    targetDate: "",
    started: false,
    completed: false,
  };
}

function createCheckpointLocalId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function TargetDateSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = parseDateKeyParts(value);
  const pickerParts = getDatePartsForPicker(value);
  const daysInMonth = getDaysInMonth(pickerParts.year, pickerParts.month);

  const yearActions: MenuAction[] = [
    {
      id: CLEAR_TARGET_DATE_ACTION,
      title: "No date",
      state: menuSelectedState(!selected),
    },
    ...getYearOptions(selected?.year).map((year) => ({
      id: String(year),
      title: String(year),
      state: menuSelectedState(selected?.year === year),
    })),
  ];
  const monthActions: MenuAction[] = [
    {
      id: CLEAR_TARGET_DATE_ACTION,
      title: "No date",
      state: menuSelectedState(!selected),
    },
    ...MONTH_OPTIONS.map((month, index) => ({
      id: String(index + 1),
      title: month,
      state: menuSelectedState(selected?.month === index + 1),
    })),
  ];
  const dayActions: MenuAction[] = [
    {
      id: CLEAR_TARGET_DATE_ACTION,
      title: "No date",
      state: menuSelectedState(!selected),
    },
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
      (day) => ({
        id: String(day),
        title: String(day),
        state: menuSelectedState(selected?.day === day),
      }),
    ),
  ];

  const selectPart = (part: TargetDatePart, actionId: string) => {
    if (actionId === CLEAR_TARGET_DATE_ACTION) {
      onChange("");
      return;
    }

    onChange(updateDatePart(value, part, Number(actionId)));
  };

  return (
    <View style={styles.targetDateRow}>
      <TargetDatePartSelect
        actions={yearActions}
        label="Year"
        onSelect={(actionId) => selectPart("year", actionId)}
        value={selected ? String(selected.year) : null}
      />
      <TargetDatePartSelect
        actions={monthActions}
        label="Month"
        onSelect={(actionId) => selectPart("month", actionId)}
        value={selected ? MONTH_OPTIONS[selected.month - 1].slice(0, 3) : null}
      />
      <TargetDatePartSelect
        actions={dayActions}
        label="Day"
        onSelect={(actionId) => selectPart("day", actionId)}
        value={selected ? String(selected.day) : null}
      />
    </View>
  );
}

function TargetDatePartSelect({
  actions,
  label,
  value,
  onSelect,
}: {
  actions: MenuAction[];
  label: string;
  value: string | null;
  onSelect: (actionId: string) => void;
}) {
  const theme = useTheme();
  const displayValue = value ?? label;

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
      style={styles.targetDateMenu}
      title={`Select ${label.toLowerCase()}`}
    >
      <View
        accessible
        accessibilityLabel={`Select target ${label.toLowerCase()}`}
        accessibilityRole="button"
        style={[
          styles.targetDateSelect,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.targetDateSelectText,
            { color: value ? theme.text : theme.textSecondary },
          ]}
        >
          {displayValue}
        </Text>
        <SymbolView
          name={symbol("chevron.down", "keyboard_arrow_down")}
          size={13}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 14,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 42,
    position: "relative",
  },
  pageHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
    paddingRight: 54,
  },
  pageHeaderText: { flex: 1, minWidth: 0, gap: 1 },
  headerActions: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  addButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  search: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: "400" },
  goalList: { gap: 12 },
  goalCard: {
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  goalCardDragging: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  goalCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  goalCardContent: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 11,
  },
  goalCardMain: {
    flex: 1,
    minWidth: 0,
    gap: 14,
  },
  goalBody: { flex: 1, minWidth: 0, gap: 4 },
  goalTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  goalTitle: { flex: 1, fontSize: 19, lineHeight: 24, fontWeight: "900" },
  goalMeta: { fontSize: 13, lineHeight: 17, fontWeight: "700" },
  goalAccent: {
    width: 5,
    minHeight: 42,
    alignSelf: "stretch",
    borderRadius: 999,
  },
  goalCheckpointList: {
    gap: 10,
    paddingLeft: 5,
  },
  goalCheckpointRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  goalCheckpointText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600",
  },
  goalProgressTrack: {
    height: 3,
    overflow: "hidden",
    borderRadius: 999,
  },
  goalProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  dragHandle: {
    width: 30,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  completedTimelineTitle: { textDecorationLine: "line-through", opacity: 0.7 },
  laterGoalsToggle: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 14,
  },
  laterGoalsToggleText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000055",
    padding: 12,
  },
  actionSheet: {
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
  actionTitle: {
    paddingHorizontal: 14,
    paddingTop: 12,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  actionSubtitle: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 8,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  planSheet: {
    overflow: "hidden",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  planSheetHeader: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  planSheetTitleBlock: { flex: 1, minWidth: 0 },
  planSheetTitle: { fontSize: 22, lineHeight: 27, fontWeight: "900" },
  planSheetSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  planSheetContent: { gap: 14, padding: 18, paddingBottom: 28 },
  planTimeGrid: { flexDirection: "row", gap: 10 },
  planTimeField: { flex: 1, minWidth: 0 },
  planSaveButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    marginTop: 2,
  },
  planSaveButtonText: { fontSize: 15, lineHeight: 20, fontWeight: "900" },
  planPeriodRow: {
    flexDirection: "row",
    gap: 6,
  },
  planPeriodChip: {
    flex: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
  },
  planPeriodLabel: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 64,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    marginBottom: 3,
  },
  emptyTitle: { fontSize: 18, lineHeight: 23, fontWeight: "800" },
  emptyDescription: {
    maxWidth: 280,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  emptyButton: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 4,
  },
  emptyButtonLabel: { fontSize: 14, fontWeight: "800" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#F3B7B933",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  errorText: {
    flex: 1,
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  retryText: { color: "#9D474D", fontSize: 12, fontWeight: "800" },
  formScreen: { flex: 1 },
  formSafeArea: { flex: 1 },
  formHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  formHeaderButton: {
    minWidth: 64,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  formHeaderButtonText: { fontSize: 15, fontWeight: "700" },
  formTitle: { fontSize: 16, lineHeight: 21, fontWeight: "800" },
  saveHint: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  saveHintText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  formContent: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: 14,
    padding: 18,
    paddingBottom: 48,
  },
  formSection: { gap: 7 },
  sectionTitle: {
    paddingHorizontal: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  sectionSurface: {
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    padding: 16,
  },
  inputField: { gap: 7 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 14,
  },
  switchCopy: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  switchDescription: { fontSize: 11, lineHeight: 16, fontWeight: "500" },
  fieldLabel: { fontSize: 13, lineHeight: 17, fontWeight: "700" },
  input: {
    minHeight: 49,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "500",
  },
  goalTimingRow: {
    flexDirection: "row",
    gap: 8,
  },
  goalTimingChip: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
  },
  goalTimingChipText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  checkpointGoalLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  checkpointNoteInput: {
    minHeight: 84,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  checkpointSaveButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  checkpointSaveText: {
    fontSize: 16,
    fontWeight: "800",
  },
  targetDateRow: {
    flexDirection: "row",
    gap: 7,
  },
  targetDateMenu: {
    flex: 1,
    minWidth: 0,
  },
  targetDateSelect: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 11,
  },
  targetDateSelectText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  checkpointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkpointHeader: {
    alignItems: "center",
    gap: 6,
    paddingTop: 7,
  },
  checkpointNumber: { fontSize: 11, lineHeight: 15, fontWeight: "800" },
  checkpointToggle: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
  },
  removeCheckpoint: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  checkpointInputs: { flex: 1, minWidth: 0, gap: 8 },
  inlineAdd: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    paddingVertical: 4,
  },
  inlineAddLabel: { fontSize: 13, lineHeight: 18, fontWeight: "800" },
  formError: {
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  pressed: { opacity: 0.72 },
});
