import * as Haptics from "expo-haptics";
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
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import { GoalActionsModal } from "@/components/daily-goals/goal-actions-modal";
import { GoalLogVisibilityControl } from "@/components/goal-log-visibility-control";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { GoalFormModal } from "@/components/goals-screen";
import { HabitFormModal } from "@/components/habits-manager-screen";
import { PlanReportHeaderMenu } from "@/components/plan-report-header-menu";
import { TaskFormModal } from "@/components/tasks/task-form-modal";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTaskProjects } from "@/hooks/use-task-projects";
import { useTheme } from "@/hooks/use-theme";
import { uploadCheckpointPhoto } from "@/lib/checkpoint-photos-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import { uploadGoalPhoto } from "@/lib/goal-photos-client";
import {
  type GoogleCalendarDayEvent,
  type GoogleCalendarEventsResponse,
  createGoogleCalendarEvent,
  fetchGoogleCalendarEvents,
  getLocalTimeZone,
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar-client";
import {
  type HabitInCategory,
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
  type HabitInput,
  type HabitVisibility,
  createHabit,
  createCategory as createHabitCategory,
  fetchCategories,
} from "@/lib/habits-client";
import { formatPlanMinutesDisplay } from "@/lib/plan-time";
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
  createPlanGoal,
  fetchPlanGoals,
  updatePlanGoalCheckpoint,
} from "@/lib/planning-goals-client";
import { scheduleHabitReminderAsync } from "@/lib/push-notifications";
import {
  type Task,
  type TaskInput,
  createTask,
  fetchTasks,
  updateTask,
} from "@/lib/tasks-client";

type DayPlanEntry = {
  allDay: boolean;
  completed?: boolean;
  description?: string | null;
  endMinutes: number;
  habitId?: string;
  id: string;
  kind: "goal" | "google" | "habit" | "task";
  laneCount: number;
  laneIndex: number;
  sourceId?: string;
  startMinutes: number;
  title: string;
};

type ActionHabit = HabitInCategory | PeriodicHabitInfo;
type CheckpointRef = {
  checkpoint: GoalCheckpoint;
  goal: Goal;
};
type CheckpointNoteTarget = {
  entry: DayPlanEntry;
  ref: CheckpointRef;
};
type PlanRange = {
  endMinutes: number;
  startMinutes: number;
};
type PlanTargetType = "dailyHabit" | "goal" | "monthlyHabit" | "task";
type PlanTargetOption = {
  id: string;
  subtitle?: string;
  title: string;
};
export type DayPlanOnboardingStep =
  | "drag"
  | "task-info"
  | "goal-info"
  | "habit-info"
  | "select-goal"
  | "goal-create"
  | "proof"
  | "mark-complete"
  | "journal-info"
  | "friends-info"
  | "done";
export type DayPlanOnboardingGuide = {
  createdGoalCheckpointId: string | null;
  onComplete: () => void;
  onGoalCreated: (checkpointId: string) => void;
  onStepChange: (step: DayPlanOnboardingStep) => void;
  step: DayPlanOnboardingStep;
};
type TimelineGesture =
  | {
      anchorMinutes: number;
      lastPageY: number;
      latestRange: PlanRange;
      type: "create";
    }
  | {
      durationMinutes: number;
      entry: DayPlanEntry;
      lastPageY: number;
      latestRange: PlanRange;
      touchOffsetMinutes: number;
      type: "move";
    };
type CachedDayPlanData = {
  googleResponse: GoogleCalendarEventsResponse;
  habitCategories: Category[];
  planGoals: Goal[];
  plannedEvents: PlannedEvent[];
  snapshot: HabitLogsSnapshot;
  tasks: Task[];
};

const HOUR_HEIGHT = 48;
const TIME_LABEL_WIDTH = 64;
const MIN_EVENT_HEIGHT = 30;
const MINUTES_IN_DAY = 24 * 60;
const PLAN_SNAP_MINUTES = 15;
const MIN_PLAN_DURATION_MINUTES = 30;
const LONG_PRESS_DELAY_MS = 500;
const TIMELINE_AUTO_SCROLL_EDGE = 54;
const TIMELINE_AUTO_SCROLL_INTERVAL_MS = 50;
const TIMELINE_AUTO_SCROLL_MAX_STEP = 18;
const TIMELINE_START_HOUR = 7;
const TIMELINE_VISIBLE_HOURS = 12;
const TIMELINE_INITIAL_OFFSET = TIMELINE_START_HOUR * HOUR_HEIGHT;
const TIMELINE_VIEWPORT_HEIGHT = TIMELINE_VISIBLE_HOURS * HOUR_HEIGHT;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
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
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DayPlanScreen({
  initialDateKey,
  onboardingGuide,
}: {
  initialDateKey?: string;
  onboardingGuide?: DayPlanOnboardingGuide;
}) {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const { projects, reloadProjects, createProject } = useTaskProjects();
  const timelineScrollRef = useRef<ScrollView>(null);
  const timelineScrollYRef = useRef(TIMELINE_INITIAL_OFFSET);
  const timelineViewportTopRef = useRef(0);
  const timelineDragLayerWidthRef = useRef(0);
  const timelineGestureRef = useRef<TimelineGesture | null>(null);
  const timelineHapticKeyRef = useRef<string | null>(null);
  const timelineAutoScrollRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const pendingEmptyPressRef = useRef<{
    locationX: number;
    locationY: number;
    pageY: number;
  } | null>(null);
  const timelineLongPressTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const suppressEntryPressUntilRef = useRef(0);
  const [selectedDate, setSelectedDate] = useState(() =>
    initialDateKey ? dateFromKey(initialDateKey) : new Date(),
  );
  const [now, setNow] = useState(() => new Date());
  const [snapshot, setSnapshot] = useState<HabitLogsSnapshot | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [planGoals, setPlanGoals] = useState<Goal[]>([]);
  const [habitCategories, setHabitCategories] = useState<Category[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarDayEvent[]>(
    [],
  );
  const [plannedEvents, setPlannedEvents] = useState<PlannedEvent[]>([]);
  const [googleStatus, setGoogleStatus] = useState<string>("synced");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [activeHabit, setActiveHabit] = useState<ActionHabit | null>(null);
  const [activeEntry, setActiveEntry] = useState<DayPlanEntry | null>(null);
  const [noteHabit, setNoteHabit] = useState<ActionHabit | null>(null);
  const [noteCheckpoint, setNoteCheckpoint] =
    useState<CheckpointNoteTarget | null>(null);
  const [dragPlanRange, setDragPlanRange] = useState<PlanRange | null>(null);
  const [draftPlanRange, setDraftPlanRange] = useState<PlanRange | null>(null);
  const [otherEventRange, setOtherEventRange] = useState<PlanRange | null>(
    null,
  );
  const [isTimelineDragging, setIsTimelineDragging] = useState(false);
  const [selectedPlanTargetType, setSelectedPlanTargetType] =
    useState<PlanTargetType | null>(null);
  const [creatingTargetType, setCreatingTargetType] =
    useState<PlanTargetType | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isCreatingOtherEvent, setIsCreatingOtherEvent] = useState(false);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const isViewingToday = useMemo(
    () => toDateKey(now) === dateKey,
    [now, dateKey],
  );
  const nowLineTop = useMemo(
    () => ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT,
    [now],
  );
  const monthKey = useMemo(() => getMonthKey(selectedDate), [selectedDate]);
  const timeZone = useMemo(() => getLocalTimeZone(), []);
  const loadSequenceRef = useRef(0);
  const snapshotCacheRef = useRef(new Map<string, HabitLogsSnapshot>());
  const snapshotInFlightRef = useRef(
    new Map<string, Promise<HabitLogsSnapshot>>(),
  );
  const tasksCacheRef = useRef(new Map<string, Task[]>());
  const tasksInFlightRef = useRef(new Map<string, Promise<Task[]>>());
  const googleEventsCacheRef = useRef(
    new Map<string, GoogleCalendarEventsResponse>(),
  );
  const googleEventsInFlightRef = useRef(
    new Map<string, Promise<GoogleCalendarEventsResponse>>(),
  );
  const plannedEventsCacheRef = useRef(new Map<string, PlannedEvent[]>());
  const plannedEventsInFlightRef = useRef(
    new Map<string, Promise<PlannedEvent[]>>(),
  );
  const isMountedRef = useRef(true);
  const planGoalsCacheRef = useRef<Goal[] | null>(null);
  const planGoalsInFlightRef = useRef<Promise<Goal[]> | null>(null);
  const habitCategoriesCacheRef = useRef<Category[] | null>(null);
  const habitCategoriesInFlightRef = useRef<Promise<Category[]> | null>(null);
  const projectsLoadedRef = useRef(false);
  const projectsInFlightRef = useRef<Promise<void> | null>(null);

  const readCachedDayPlanData = useCallback(
    (
      targetMonthKey: string,
      targetDateKey: string,
    ): CachedDayPlanData | null => {
      const snapshot = snapshotCacheRef.current.get(targetMonthKey);
      const tasksForDay = tasksCacheRef.current.get(targetDateKey);
      const googleResponse = googleEventsCacheRef.current.get(targetDateKey);
      const plannedEventsForDay =
        plannedEventsCacheRef.current.get(targetDateKey);
      const cachedPlanGoals = planGoalsCacheRef.current;
      const cachedHabitCategories = habitCategoriesCacheRef.current;

      if (
        !snapshot ||
        !tasksForDay ||
        !googleResponse ||
        !plannedEventsForDay ||
        !cachedPlanGoals ||
        !cachedHabitCategories
      ) {
        return null;
      }

      return {
        googleResponse,
        habitCategories: cachedHabitCategories,
        planGoals: cachedPlanGoals,
        plannedEvents: plannedEventsForDay,
        snapshot,
        tasks: tasksForDay,
      };
    },
    [],
  );

  const applyDayPlanData = useCallback((data: CachedDayPlanData) => {
    setSnapshot(data.snapshot);
    setTasks(data.tasks);
    setPlanGoals(data.planGoals);
    setHabitCategories(data.habitCategories);
    setGoogleEvents(data.googleResponse.events);
    setPlannedEvents(data.plannedEvents);
    setGoogleStatus(data.googleResponse.status);
  }, []);

  const getSnapshotForMonth = useCallback(
    (targetMonthKey: string, force = false) => {
      if (!force) {
        const cached = snapshotCacheRef.current.get(targetMonthKey);
        if (cached) return Promise.resolve(cached);

        const inFlight = snapshotInFlightRef.current.get(targetMonthKey);
        if (inFlight) return inFlight;
      }

      const request = fetchHabitLogsSnapshot(targetMonthKey)
        .then((nextSnapshot) => {
          if (snapshotInFlightRef.current.get(targetMonthKey) === request) {
            snapshotCacheRef.current.set(targetMonthKey, nextSnapshot);
          }
          return nextSnapshot;
        })
        .finally(() => {
          if (snapshotInFlightRef.current.get(targetMonthKey) === request) {
            snapshotInFlightRef.current.delete(targetMonthKey);
          }
        });

      snapshotInFlightRef.current.set(targetMonthKey, request);
      return request;
    },
    [],
  );

  const getTasksForDate = useCallback(
    (targetDateKey: string, force = false) => {
      if (!force) {
        const cached = tasksCacheRef.current.get(targetDateKey);
        if (cached) return Promise.resolve(cached);

        const inFlight = tasksInFlightRef.current.get(targetDateKey);
        if (inFlight) return inFlight;
      }

      const request = fetchTasks(targetDateKey)
        .then((nextTasks) => {
          if (tasksInFlightRef.current.get(targetDateKey) === request) {
            tasksCacheRef.current.set(targetDateKey, nextTasks);
          }
          return nextTasks;
        })
        .finally(() => {
          if (tasksInFlightRef.current.get(targetDateKey) === request) {
            tasksInFlightRef.current.delete(targetDateKey);
          }
        });

      tasksInFlightRef.current.set(targetDateKey, request);
      return request;
    },
    [],
  );

  const getGoogleEventsForDate = useCallback(
    (targetDate: Date, targetDateKey: string, force = false) => {
      if (!force) {
        const cached = googleEventsCacheRef.current.get(targetDateKey);
        if (cached) return Promise.resolve(cached);

        const inFlight = googleEventsInFlightRef.current.get(targetDateKey);
        if (inFlight) return inFlight;
      }

      const range = getDayRange(targetDate);
      const request = fetchGoogleCalendarEvents({
        timeMax: range.timeMax,
        timeMin: range.timeMin,
        timeZone,
      })
        .then((response) => {
          if (googleEventsInFlightRef.current.get(targetDateKey) === request) {
            googleEventsCacheRef.current.set(targetDateKey, response);
          }
          return response;
        })
        .finally(() => {
          if (googleEventsInFlightRef.current.get(targetDateKey) === request) {
            googleEventsInFlightRef.current.delete(targetDateKey);
          }
        });

      googleEventsInFlightRef.current.set(targetDateKey, request);
      return request;
    },
    [timeZone],
  );

  const getPlannedEventsForDate = useCallback(
    (targetDateKey: string, force = false) => {
      if (!force) {
        const cached = plannedEventsCacheRef.current.get(targetDateKey);
        if (cached) return Promise.resolve(cached);

        const inFlight = plannedEventsInFlightRef.current.get(targetDateKey);
        if (inFlight) return inFlight;
      }

      const request = fetchPlannedEvents({ dateKey: targetDateKey })
        .then((nextPlannedEvents) => {
          if (plannedEventsInFlightRef.current.get(targetDateKey) === request) {
            plannedEventsCacheRef.current.set(targetDateKey, nextPlannedEvents);
          }
          return nextPlannedEvents;
        })
        .finally(() => {
          if (plannedEventsInFlightRef.current.get(targetDateKey) === request) {
            plannedEventsInFlightRef.current.delete(targetDateKey);
          }
        });

      plannedEventsInFlightRef.current.set(targetDateKey, request);
      return request;
    },
    [],
  );

  const getPlanGoals = useCallback((force = false) => {
    if (!force && planGoalsCacheRef.current) {
      return Promise.resolve(planGoalsCacheRef.current);
    }

    if (!force && planGoalsInFlightRef.current) {
      return planGoalsInFlightRef.current;
    }

    const request = fetchPlanGoals()
      .then((nextPlanGoals) => {
        if (planGoalsInFlightRef.current === request) {
          planGoalsCacheRef.current = nextPlanGoals;
        }
        return nextPlanGoals;
      })
      .finally(() => {
        if (planGoalsInFlightRef.current === request) {
          planGoalsInFlightRef.current = null;
        }
      });

    planGoalsInFlightRef.current = request;
    return request;
  }, []);

  const getHabitCategories = useCallback((force = false) => {
    if (!force && habitCategoriesCacheRef.current) {
      return Promise.resolve(habitCategoriesCacheRef.current);
    }

    if (!force && habitCategoriesInFlightRef.current) {
      return habitCategoriesInFlightRef.current;
    }

    const request = fetchCategories()
      .then((nextHabitCategories) => {
        if (habitCategoriesInFlightRef.current === request) {
          habitCategoriesCacheRef.current = nextHabitCategories;
        }
        return nextHabitCategories;
      })
      .finally(() => {
        if (habitCategoriesInFlightRef.current === request) {
          habitCategoriesInFlightRef.current = null;
        }
      });

    habitCategoriesInFlightRef.current = request;
    return request;
  }, []);

  const ensureProjects = useCallback(
    (force = false) => {
      if (!force && projectsLoadedRef.current) return Promise.resolve();
      if (!force && projectsInFlightRef.current) {
        return projectsInFlightRef.current;
      }

      const request = reloadProjects()
        .then(() => {
          if (projectsInFlightRef.current === request) {
            projectsLoadedRef.current = true;
          }
        })
        .finally(() => {
          if (projectsInFlightRef.current === request) {
            projectsInFlightRef.current = null;
          }
        });

      projectsInFlightRef.current = request;
      return request;
    },
    [reloadProjects],
  );

  const prefetchDay = useCallback(
    (targetDate: Date) => {
      const targetDateKey = toDateKey(targetDate);
      const targetMonthKey = getMonthKey(targetDate);

      void Promise.allSettled([
        getSnapshotForMonth(targetMonthKey),
        getTasksForDate(targetDateKey),
        getGoogleEventsForDate(targetDate, targetDateKey),
        getPlannedEventsForDate(targetDateKey),
      ]);
    },
    [
      getGoogleEventsForDate,
      getPlannedEventsForDate,
      getSnapshotForMonth,
      getTasksForDate,
    ],
  );

  const prefetchAdjacentDays = useCallback(
    (targetDate: Date) => {
      prefetchDay(addDays(targetDate, -1));
      prefetchDay(addDays(targetDate, 1));
    },
    [prefetchDay],
  );

  const invalidateCurrentCaches = useCallback(
    ({
      google = false,
      habitCategories: shouldInvalidateHabitCategories = false,
      planGoals: shouldInvalidatePlanGoals = false,
      planned = false,
      snapshot: shouldInvalidateSnapshot = false,
      tasks: shouldInvalidateTasks = false,
    }: {
      google?: boolean;
      habitCategories?: boolean;
      planGoals?: boolean;
      planned?: boolean;
      snapshot?: boolean;
      tasks?: boolean;
    }) => {
      if (shouldInvalidateSnapshot) {
        snapshotCacheRef.current.delete(monthKey);
        snapshotInFlightRef.current.delete(monthKey);
      }

      if (shouldInvalidateTasks) {
        tasksCacheRef.current.clear();
        tasksInFlightRef.current.clear();
      }

      if (google) {
        googleEventsCacheRef.current.delete(dateKey);
        googleEventsInFlightRef.current.delete(dateKey);
      }

      if (planned) {
        plannedEventsCacheRef.current.delete(dateKey);
        plannedEventsInFlightRef.current.delete(dateKey);
      }

      if (shouldInvalidatePlanGoals) {
        planGoalsCacheRef.current = null;
        planGoalsInFlightRef.current = null;
      }

      if (shouldInvalidateHabitCategories) {
        habitCategoriesCacheRef.current = null;
        habitCategoriesInFlightRef.current = null;
      }
    },
    [dateKey, monthKey],
  );

  const load = useCallback(
    async ({ force = false, refreshing = false } = {}) => {
      if (!isMountedRef.current) return;
      const targetDate = selectedDate;
      const targetDateKey = dateKey;
      const targetMonthKey = monthKey;
      loadSequenceRef.current += 1;
      const sequence = loadSequenceRef.current;

      if (refreshing) {
        setIsRefreshing(true);
      } else {
        const cached = force
          ? null
          : readCachedDayPlanData(targetMonthKey, targetDateKey);

        if (cached) {
          applyDayPlanData(cached);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
      }
      setError(null);
      if (!force && !refreshing) {
        prefetchAdjacentDays(targetDate);
      }

      try {
        const [
          nextSnapshot,
          nextTasks,
          nextPlanGoals,
          googleResponse,
          nextPlannedEvents,
          nextHabitCategories,
        ] = await Promise.all([
          getSnapshotForMonth(targetMonthKey, force),
          getTasksForDate(targetDateKey, force),
          getPlanGoals(force),
          getGoogleEventsForDate(targetDate, targetDateKey, force),
          getPlannedEventsForDate(targetDateKey, force),
          getHabitCategories(force),
          ensureProjects(force),
        ]);

        if (!isMountedRef.current || sequence !== loadSequenceRef.current) {
          return;
        }

        setSnapshot(nextSnapshot);
        setTasks(nextTasks);
        setPlanGoals(nextPlanGoals);
        setHabitCategories(nextHabitCategories);
        setGoogleEvents(googleResponse.events);
        setPlannedEvents(nextPlannedEvents);
        setGoogleStatus(googleResponse.status);
        prefetchAdjacentDays(targetDate);
      } catch (loadError) {
        if (!isMountedRef.current || sequence !== loadSequenceRef.current) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load day plan.",
        );
      } finally {
        if (isMountedRef.current && sequence === loadSequenceRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [
      applyDayPlanData,
      dateKey,
      ensureProjects,
      getGoogleEventsForDate,
      getHabitCategories,
      getPlanGoals,
      getPlannedEventsForDate,
      getSnapshotForMonth,
      getTasksForDate,
      monthKey,
      prefetchAdjacentDays,
      readCachedDayPlanData,
      selectedDate,
    ],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the current-time indicator in sync, ticking at the top of each minute.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, msUntilNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the timeline to 7:00 when changing dates
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      timelineScrollYRef.current = TIMELINE_INITIAL_OFFSET;
      timelineScrollRef.current?.scrollTo({
        animated: false,
        y: TIMELINE_INITIAL_OFFSET,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [dateKey]);

  useEffect(
    () => () => {
      isMountedRef.current = false;
      if (timelineAutoScrollRef.current) {
        clearInterval(timelineAutoScrollRef.current);
      }
      if (timelineLongPressTimerRef.current) {
        clearTimeout(timelineLongPressTimerRef.current);
      }
    },
    [],
  );

  const habitById = useMemo(() => buildHabitMap(snapshot), [snapshot]);
  const taskById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks) map.set(task.id, task);
    return map;
  }, [tasks]);
  const checkpointById = useMemo(() => {
    const map = new Map<string, CheckpointRef>();
    for (const goal of planGoals) {
      for (const checkpoint of goal.checkpoints) {
        map.set(checkpoint.id, { checkpoint, goal });
      }
    }
    return map;
  }, [planGoals]);
  const dailyHabitOptions = useMemo<PlanTargetOption[]>(
    () =>
      snapshot?.categories.flatMap((category) =>
        category.habits
          .filter(
            (habit) =>
              habit.period === "daily" &&
              !habit.hidden &&
              snapshot.logsByHabitDate[`${habit.id}_${dateKey}`] !== "complete",
          )
          .map((habit) => ({
            id: habit.id,
            subtitle: category.name,
            title: habit.name,
          })),
      ) ?? [],
    [dateKey, snapshot],
  );
  const monthlyHabitOptions = useMemo<PlanTargetOption[]>(
    () =>
      snapshot?.periodicHabits
        .filter(
          (habit) =>
            habit.period === "monthly" &&
            snapshot.logsByHabitDate[`${habit.id}_${dateKey}`] !== "complete",
        )
        .map((habit) => ({
          id: habit.id,
          subtitle: habit.goalTitle ?? "Monthly habit",
          title: habit.name,
        })) ?? [],
    [dateKey, snapshot],
  );
  const taskOptions = useMemo<PlanTargetOption[]>(
    () =>
      tasks
        .filter((task) => !task.completedAt)
        .map((task) => ({
          id: task.id,
          subtitle: [task.timeRequired, task.importance]
            .filter(Boolean)
            .join(" · "),
          title: task.name,
        })),
    [tasks],
  );
  const goalOptions = useMemo<PlanTargetOption[]>(
    () =>
      planGoals.flatMap((goal) =>
        goal.checkpoints
          .filter((checkpoint) => !checkpoint.completed)
          .map((checkpoint) => ({
            id: checkpoint.id,
            subtitle: [
              goal.title,
              checkpoint.targetDate
                ? formatDisplayDate(checkpoint.targetDate)
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
            title: checkpoint.title,
          })),
      ),
    [planGoals],
  );
  const entries = useMemo(
    () =>
      buildDayPlanEntries({
        checkpointById,
        dateKey,
        googleEvents,
        habitById,
        plannedEvents,
        snapshot,
        taskById,
        selectedDate,
      }),
    [
      checkpointById,
      dateKey,
      googleEvents,
      habitById,
      plannedEvents,
      selectedDate,
      snapshot,
      taskById,
    ],
  );
  const timedEntries = useMemo(
    () => layoutTimedEntries(entries.filter((entry) => !entry.allDay)),
    [entries],
  );
  const allDayEntries = entries.filter((entry) => entry.allDay);
  const activeKey = activeHabit ? `${activeHabit.id}_${dateKey}` : null;
  const activeCheckpoint =
    activeEntry?.kind === "goal" && activeEntry.sourceId
      ? (checkpointById.get(activeEntry.sourceId) ?? null)
      : null;
  const activeRepeatingPlan = activeHabit
    ? snapshot?.repeatingPlansByHabit[activeHabit.id]
    : undefined;
  const activePlannedTime = activeKey
    ? (snapshot?.plannedTimesByHabitDate[activeKey] ??
      (activeRepeatingPlan && dateKey >= activeRepeatingPlan.originDate
        ? {
            endTime: activeRepeatingPlan.endTime,
            repeatsDaily: true,
            startTime: activeRepeatingPlan.startTime,
          }
        : undefined))
    : undefined;
  const isPlanSheetOpen = Boolean(
    activeHabit ||
      activeEntry ||
      draftPlanRange ||
      otherEventRange ||
      creatingTargetType ||
      noteHabit ||
      noteCheckpoint,
  );
  const onboardingStep = onboardingGuide?.step ?? null;
  const timelineScrollMax = HOUR_HEIGHT * 24 - TIMELINE_VIEWPORT_HEIGHT;
  const updateTimelineViewportTop = (pageY: number, timelineY: number) => {
    timelineViewportTopRef.current =
      pageY - timelineY + timelineScrollYRef.current;
  };
  const getTimelineMinutesFromPageY = (pageY: number) =>
    minutesFromTimelineY(
      timelineScrollYRef.current + pageY - timelineViewportTopRef.current,
    );
  const playTimelineDragStartHaptic = () => {
    const haptic =
      Platform.OS === "android"
        ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Drag_Start)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    void haptic.catch(() => undefined);
  };
  const playTimelineRangeHaptic = (range: PlanRange, force = false) => {
    const key = `${range.startMinutes}-${range.endMinutes}`;
    if (!force && timelineHapticKeyRef.current === key) return;

    timelineHapticKeyRef.current = key;
    const haptic =
      Platform.OS === "android"
        ? Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Segment_Tick,
          )
        : Haptics.selectionAsync();

    void haptic.catch(() => undefined);
  };
  const stopTimelineAutoScroll = () => {
    if (!timelineAutoScrollRef.current) return;
    clearInterval(timelineAutoScrollRef.current);
    timelineAutoScrollRef.current = null;
  };
  const updateTimelineGestureFromPageY = (pageY: number) => {
    const gesture = timelineGestureRef.current;
    if (!gesture) return;

    const currentMinutes = getTimelineMinutesFromPageY(pageY);
    const range =
      gesture.type === "create"
        ? normalizePlanRange(gesture.anchorMinutes, currentMinutes)
        : movePlanRange({
            durationMinutes: gesture.durationMinutes,
            touchOffsetMinutes: gesture.touchOffsetMinutes,
            touchMinutes: currentMinutes,
          });

    timelineGestureRef.current = {
      ...gesture,
      lastPageY: pageY,
      latestRange: range,
    };
    playTimelineRangeHaptic(range);
    setDragPlanRange(range);
  };
  const updateTimelineAutoScroll = (pageY: number) => {
    const viewportY = pageY - timelineViewportTopRef.current;
    const topDistance = Math.max(0, TIMELINE_AUTO_SCROLL_EDGE - viewportY);
    const bottomDistance = Math.max(
      0,
      viewportY - (TIMELINE_VIEWPORT_HEIGHT - TIMELINE_AUTO_SCROLL_EDGE),
    );
    const direction = topDistance > 0 ? -1 : bottomDistance > 0 ? 1 : 0;

    if (direction === 0) {
      stopTimelineAutoScroll();
      return;
    }

    if (timelineAutoScrollRef.current) return;

    timelineAutoScrollRef.current = setInterval(() => {
      const current = timelineGestureRef.current;
      if (!current) {
        stopTimelineAutoScroll();
        return;
      }

      const activeViewportY =
        current.lastPageY - timelineViewportTopRef.current;
      const activeTopDistance = Math.max(
        0,
        TIMELINE_AUTO_SCROLL_EDGE - activeViewportY,
      );
      const activeBottomDistance = Math.max(
        0,
        activeViewportY -
          (TIMELINE_VIEWPORT_HEIGHT - TIMELINE_AUTO_SCROLL_EDGE),
      );
      const activeDirection =
        activeTopDistance > 0 ? -1 : activeBottomDistance > 0 ? 1 : 0;

      if (activeDirection === 0) {
        stopTimelineAutoScroll();
        return;
      }

      const distance = Math.max(activeTopDistance, activeBottomDistance);
      const step = Math.min(
        TIMELINE_AUTO_SCROLL_MAX_STEP,
        Math.max(4, distance * 0.28),
      );
      const nextScrollY = clampNumber(
        timelineScrollYRef.current + activeDirection * step,
        0,
        timelineScrollMax,
      );

      if (nextScrollY === timelineScrollYRef.current) {
        return;
      }

      timelineScrollYRef.current = nextScrollY;
      timelineScrollRef.current?.scrollTo({
        animated: false,
        y: nextScrollY,
      });
      updateTimelineGestureFromPageY(current.lastPageY);
    }, TIMELINE_AUTO_SCROLL_INTERVAL_MS);
  };
  const handleEmptyTimelinePressIn = (event: GestureResponderEvent) => {
    const { locationX, locationY, pageY } = event.nativeEvent;
    pendingEmptyPressRef.current = { locationX, locationY, pageY };
    updateTimelineViewportTop(pageY, locationY);
  };
  const handleEmptyTimelineLongPress = () => {
    const press = pendingEmptyPressRef.current;
    if (!press) return;

    if (
      isTimelinePointOnEntry({
        entries: timedEntries,
        timelineWidth: timelineDragLayerWidthRef.current,
        x: press.locationX,
        y: press.locationY,
      })
    ) {
      return;
    }

    const startMinutes = minutesFromTimelineY(press.locationY);
    const range = normalizePlanRange(
      startMinutes,
      startMinutes + MIN_PLAN_DURATION_MINUTES,
    );
    timelineGestureRef.current = {
      anchorMinutes: startMinutes,
      lastPageY: press.pageY,
      latestRange: range,
      type: "create",
    };
    setDraftPlanRange(null);
    setSelectedPlanTargetType(null);
    setDragPlanRange(range);
    setIsTimelineDragging(true);
    playTimelineDragStartHaptic();
    playTimelineRangeHaptic(range, true);
    updateTimelineAutoScroll(press.pageY);
  };
  const handleTimelinePressMove = (event: GestureResponderEvent) => {
    const { pageY } = event.nativeEvent;
    if (!timelineGestureRef.current) return;

    updateTimelineGestureFromPageY(pageY);
    updateTimelineAutoScroll(pageY);
  };
  const saveMovedEntry = async (entry: DayPlanEntry, range: PlanRange) => {
    const startTime = formatPlanApiTime(range.startMinutes);
    const endTime = formatPlanApiTime(range.endMinutes);
    setUpdatingKey(entry.id);

    try {
      if (entry.kind === "habit" && entry.habitId) {
        await setHabitLog(entry.habitId, dateKey, "planned", {
          endTime,
          startTime,
          timeZone,
        });
        invalidateCurrentCaches({ google: true, snapshot: true });
      } else if (entry.kind === "task" || entry.kind === "goal") {
        if (!entry.sourceId) throw new Error("Could not find that event.");

        await upsertPlannedEvent({
          dateKey,
          endTime,
          sourceId: entry.sourceId,
          sourceType: entry.kind === "task" ? "task" : "goal_checkpoint",
          startTime,
          timeZone,
          title: entry.title,
        });
        invalidateCurrentCaches({ google: true, planned: true });
      } else if (entry.kind === "google") {
        const response = await updateGoogleCalendarEvent({
          dateKey,
          description: entry.description ?? null,
          endTime,
          eventId: entry.sourceId ?? googleEntryId(entry.id),
          startTime,
          timeZone,
          title: entry.title,
        });
        if (response.status !== "synced") {
          throw new Error(getGoogleCalendarStatusMessage(response.status));
        }
        invalidateCurrentCaches({ google: true });
      }

      if (!isMountedRef.current) return;
      await load();
    } catch (moveError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not move event",
        moveError instanceof Error
          ? moveError.message
          : "The event could not be moved.",
      );
    } finally {
      if (isMountedRef.current) setUpdatingKey(null);
    }
  };
  const finishTimelineGesture = () => {
    pendingEmptyPressRef.current = null;
    stopTimelineAutoScroll();

    const gesture = timelineGestureRef.current;
    timelineGestureRef.current = null;
    timelineHapticKeyRef.current = null;
    setIsTimelineDragging(false);
    setDragPlanRange(null);

    if (!gesture) return;

    if (gesture.type === "create") {
      setDraftPlanRange(gesture.latestRange);
      setSelectedPlanTargetType(null);
      if (onboardingGuide?.step === "drag") {
        onboardingGuide.onStepChange("task-info");
      }
      return;
    }

    void saveMovedEntry(gesture.entry, gesture.latestRange);
  };
  const clearTimelineLongPressTimer = () => {
    if (timelineLongPressTimerRef.current) {
      clearTimeout(timelineLongPressTimerRef.current);
      timelineLongPressTimerRef.current = null;
    }
  };
  // The empty-timeline drag is driven by the raw responder system rather than
  // Pressable so the picker only opens on a real finger lift (onResponderRelease)
  // and never on a mid-gesture touch cancellation.
  const handleTimelineResponderGrant = (event: GestureResponderEvent) => {
    handleEmptyTimelinePressIn(event);
    clearTimelineLongPressTimer();
    timelineLongPressTimerRef.current = setTimeout(() => {
      timelineLongPressTimerRef.current = null;
      handleEmptyTimelineLongPress();
    }, LONG_PRESS_DELAY_MS);
  };
  const handleTimelineResponderMove = (event: GestureResponderEvent) => {
    // Ignore movement until the long press has actually started a drag; until
    // then the scroll view is free to take over for normal scrolling.
    if (!timelineGestureRef.current) return;
    handleTimelinePressMove(event);
  };
  const handleTimelineResponderRelease = () => {
    clearTimelineLongPressTimer();
    finishTimelineGesture();
  };
  const cancelTimelineGesture = () => {
    clearTimelineLongPressTimer();
    pendingEmptyPressRef.current = null;
    stopTimelineAutoScroll();
    timelineGestureRef.current = null;
    timelineHapticKeyRef.current = null;
    setIsTimelineDragging(false);
    setDragPlanRange(null);
  };
  const beginMoveEntry = (
    entry: DayPlanEntry,
    event: GestureResponderEvent,
  ) => {
    const { locationY, pageY } = event.nativeEvent;
    const entryTop = (entry.startMinutes / 60) * HOUR_HEIGHT;
    const timelineY = entryTop + locationY;
    const touchOffsetMinutes = clampNumber(
      (locationY / HOUR_HEIGHT) * 60,
      0,
      Math.max(0, entry.endMinutes - entry.startMinutes),
    );
    const durationMinutes = Math.max(
      MIN_PLAN_DURATION_MINUTES,
      entry.endMinutes - entry.startMinutes,
    );
    const range = {
      endMinutes: entry.startMinutes + durationMinutes,
      startMinutes: entry.startMinutes,
    };

    updateTimelineViewportTop(pageY, timelineY);
    suppressEntryPressUntilRef.current = Date.now() + 700;
    timelineGestureRef.current = {
      durationMinutes,
      entry,
      lastPageY: pageY,
      latestRange: range,
      touchOffsetMinutes,
      type: "move",
    };
    setDraftPlanRange(null);
    setSelectedPlanTargetType(null);
    setDragPlanRange(range);
    setIsTimelineDragging(true);
    playTimelineDragStartHaptic();
    playTimelineRangeHaptic(range, true);
    updateTimelineAutoScroll(pageY);
  };

  const goToToday = () => setSelectedDate(startOfDay(new Date()));
  const moveDate = (days: number) =>
    setSelectedDate((current) => addDays(current, days));
  const openInternalEntry = (entry: DayPlanEntry) => {
    if (Date.now() < suppressEntryPressUntilRef.current) return;

    if (entry.kind === "habit" && entry.habitId) {
      setActiveHabit(habitById.get(entry.habitId) ?? null);
      return;
    }

    if (entry.kind === "task" || entry.kind === "goal") {
      setActiveEntry(entry);
    }
  };

  const setActiveStatus = async (
    status: "complete" | "planned" | null,
    options?: {
      endTime?: string | null;
      repeatPlan?: boolean;
      startTime?: string | null;
      timeZone?: string | null;
    },
  ) => {
    if (!activeHabit) return;

    const key = `${activeHabit.id}_${dateKey}`;
    setUpdatingKey(key);
    try {
      const nextOptions =
        status === "complete" && !options && activePlannedTime
          ? {
              endTime: activePlannedTime.endTime,
              startTime: activePlannedTime.startTime,
              timeZone,
            }
          : options;

      await setHabitLog(activeHabit.id, dateKey, status, nextOptions);
      invalidateCurrentCaches({ google: true, snapshot: true });
      if (!isMountedRef.current) return;
      await load();
    } catch (updateError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Day Plan",
        updateError instanceof Error
          ? updateError.message
          : "Could not update this habit.",
      );
    } finally {
      if (isMountedRef.current) setUpdatingKey(null);
    }
  };

  const setActiveVisibility = async (visibility: HabitVisibility) => {
    if (!activeHabit) return;

    const key = `${activeHabit.id}_${dateKey}`;
    setUpdatingKey(key);
    try {
      await setHabitLogVisibility(activeHabit.id, dateKey, visibility);
      invalidateCurrentCaches({ snapshot: true });
      if (!isMountedRef.current) return;
      await load();
    } catch (updateError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Day Plan",
        updateError instanceof Error
          ? updateError.message
          : "Could not update visibility.",
      );
    } finally {
      if (isMountedRef.current) setUpdatingKey(null);
    }
  };

  const saveNote = async (habitId: string, notes: string) => {
    await setHabitLogNote(habitId, dateKey, notes);
    invalidateCurrentCaches({ snapshot: true });
    if (!isMountedRef.current) return;
    await load();
  };

  const addPhoto = async (habitId: string, source: GoalPhotoSource) => {
    if (uploadingPhotoSource) return;

    setUploadingPhotoSource(source);
    try {
      const photo = await pickGoalPhoto(source);
      if (!photo) return;

      await uploadGoalPhoto(habitId, dateKey, photo);
      invalidateCurrentCaches({ snapshot: true });
      if (!isMountedRef.current) return;
      await load();
    } catch (photoError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not add photo",
        photoError instanceof Error
          ? photoError.message
          : "The photo could not be uploaded.",
      );
    } finally {
      if (isMountedRef.current) setUploadingPhotoSource(null);
    }
  };

  const saveCheckpointNote = async (
    target: CheckpointNoteTarget,
    notes: string,
  ) => {
    await updatePlanGoalCheckpoint(target.ref.checkpoint.id, {
      completed: target.ref.checkpoint.completed,
      notes: notes.trim() ? notes.trim() : null,
      visibility: target.ref.checkpoint.visibility,
    });
    invalidateCurrentCaches({ planGoals: true });
    if (!isMountedRef.current) return;
    setActiveEntry(target.entry);
    await load();
  };

  const setActiveCheckpointVisibility = async (visibility: HabitVisibility) => {
    if (!activeCheckpoint) return;

    setUpdatingKey(`goal-${activeCheckpoint.checkpoint.id}`);
    try {
      await updatePlanGoalCheckpoint(activeCheckpoint.checkpoint.id, {
        completed: activeCheckpoint.checkpoint.completed,
        notes: activeCheckpoint.checkpoint.notes,
        visibility,
      });
      invalidateCurrentCaches({ planGoals: true });
      if (!isMountedRef.current) return;
      await load();
    } catch (updateError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not update visibility",
        updateError instanceof Error
          ? updateError.message
          : "The post visibility could not be changed.",
      );
    } finally {
      if (isMountedRef.current) setUpdatingKey(null);
    }
  };

  const completeActiveEntry = async () => {
    if (!activeEntry?.sourceId) return;

    setUpdatingKey(`${activeEntry.kind}-${activeEntry.sourceId}`);
    try {
      if (activeEntry.kind === "task") {
        const task = taskById.get(activeEntry.sourceId);
        if (!task) {
          Alert.alert("Day Plan", "Could not find that task.");
          return;
        }

        await updateTask(task.id, {
          completedAt: task.completedAt ? null : dateKey,
          dueDate: task.dueDate,
          importance: task.importance,
          name: task.name,
          projectId: task.projectId,
          timeRequired: task.timeRequired,
        });
        invalidateCurrentCaches({ tasks: true });
      } else if (activeEntry.kind === "goal") {
        const checkpoint = checkpointById.get(activeEntry.sourceId);
        if (!checkpoint) {
          Alert.alert("Day Plan", "Could not find that checkpoint.");
          return;
        }

        await updatePlanGoalCheckpoint(checkpoint.checkpoint.id, {
          completed: !checkpoint.checkpoint.completed,
        });
        invalidateCurrentCaches({ planGoals: true });
        if (
          onboardingGuide?.createdGoalCheckpointId ===
            checkpoint.checkpoint.id &&
          onboardingGuide.step === "mark-complete"
        ) {
          onboardingGuide.onStepChange("journal-info");
        }
      }

      if (!isMountedRef.current) return;
      setActiveEntry(null);
      await load();
    } catch (completeError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not update event",
        completeError instanceof Error
          ? completeError.message
          : "The event could not be updated.",
      );
    } finally {
      if (isMountedRef.current) setUpdatingKey(null);
    }
  };

  const deleteActiveEntry = async () => {
    if (!activeEntry?.sourceId) return;

    const entry = activeEntry;
    const sourceId = activeEntry.sourceId;
    Alert.alert(
      "Delete event?",
      `"${entry.title}" will be removed from your day plan and calendar.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setUpdatingKey(`${entry.kind}-${sourceId}`);
            try {
              await deletePlannedEvent({
                sourceId,
                sourceType: entry.kind === "task" ? "task" : "goal_checkpoint",
              });
              invalidateCurrentCaches({ google: true, planned: true });
              if (!isMountedRef.current) return;
              setActiveEntry(null);
              await load();
            } catch (deleteError) {
              if (!isMountedRef.current) return;
              Alert.alert(
                "Could not delete event",
                deleteError instanceof Error
                  ? deleteError.message
                  : "The event could not be deleted.",
              );
            } finally {
              if (isMountedRef.current) setUpdatingKey(null);
            }
          },
        },
      ],
    );
  };

  const openAttachmentForActiveEntry = () => {
    if (!activeEntry?.sourceId) return;

    if (activeEntry.kind !== "goal") {
      Alert.alert(
        "Photos and notes for this event",
        "Task photos and notes need a post model before they can show in Journal and Friends.",
      );
      return;
    }

    const ref = checkpointById.get(activeEntry.sourceId);
    if (!ref) {
      Alert.alert("Day Plan", "Could not find that checkpoint.");
      return;
    }

    setNoteCheckpoint({ entry: activeEntry, ref });
    setActiveEntry(null);
  };

  const addCheckpointPhotoForActiveEntry = async (source: GoalPhotoSource) => {
    if (!activeEntry?.sourceId || uploadingPhotoSource) return;

    if (activeEntry.kind !== "goal") {
      Alert.alert(
        "Photos for this event",
        "Task photos need a post model before they can show in Journal and Friends.",
      );
      return;
    }

    const checkpoint = checkpointById.get(activeEntry.sourceId);
    if (!checkpoint) {
      Alert.alert("Day Plan", "Could not find that checkpoint.");
      return;
    }

    setUploadingPhotoSource(source);
    try {
      const photo = await pickGoalPhoto(source);
      if (!photo) return;

      await uploadCheckpointPhoto(checkpoint.checkpoint.id, photo);
      invalidateCurrentCaches({ planGoals: true });
      if (!isMountedRef.current) return;
      await load();
      if (
        onboardingGuide?.createdGoalCheckpointId === checkpoint.checkpoint.id &&
        onboardingGuide.step === "proof"
      ) {
        onboardingGuide.onStepChange("mark-complete");
      }
    } catch (photoError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not add photo",
        photoError instanceof Error
          ? photoError.message
          : "The photo could not be uploaded.",
      );
    } finally {
      if (isMountedRef.current) setUploadingPhotoSource(null);
    }
  };

  const closeDraftPlan = () => {
    setDraftPlanRange(null);
    setSelectedPlanTargetType(null);
    setCreatingTargetType(null);
    setIsCreatingPlan(false);
  };

  const openOtherEventForm = () => {
    if (!draftPlanRange) return;
    setOtherEventRange(draftPlanRange);
    closeDraftPlan();
  };

  const createCategory = async (name: string, icon: string) => {
    const category = await createHabitCategory({ icon, name });
    if (!isMountedRef.current) return category;
    setHabitCategories((current) => {
      const nextCategories = [...current, category].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      habitCategoriesCacheRef.current = nextCategories;
      return nextCategories;
    });
    return category;
  };

  const saveCreatedTask = async (input: TaskInput) => {
    const saved = await createTask(input);
    if (!isMountedRef.current) return;
    invalidateCurrentCaches({ tasks: true });
    setTasks((current) => [saved, ...current]);
    setCreatingTargetType(null);
    if (draftPlanRange) {
      await upsertPlannedEvent({
        dateKey,
        endTime: formatPlanApiTime(draftPlanRange.endMinutes),
        sourceId: saved.id,
        sourceType: "task",
        startTime: formatPlanApiTime(draftPlanRange.startMinutes),
        timeZone,
        title: saved.name,
      });
      if (!isMountedRef.current) return;
      invalidateCurrentCaches({ google: true, planned: true });
      closeDraftPlan();
      await load();
    }
    void ensureProjects(true);
  };

  const saveCreatedHabit = async (input: HabitInput) => {
    const saved = await createHabit(input);
    if (!isMountedRef.current) return;
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
    if (!isMountedRef.current) return;
    snapshotCacheRef.current.clear();
    snapshotInFlightRef.current.clear();
    setCreatingTargetType(null);
    await load();
  };

  const saveCreatedGoal = async (input: GoalInput) => {
    const saved = await createPlanGoal(input);
    if (!isMountedRef.current) return;
    invalidateCurrentCaches({ planGoals: true });
    setCreatingTargetType(null);
    const checkpoint = saved.checkpoints[0];
    if (draftPlanRange && checkpoint) {
      await upsertPlannedEvent({
        dateKey,
        endTime: formatPlanApiTime(draftPlanRange.endMinutes),
        sourceId: checkpoint.id,
        sourceType: "goal_checkpoint",
        startTime: formatPlanApiTime(draftPlanRange.startMinutes),
        timeZone,
        title: checkpoint.title,
      });
      if (!isMountedRef.current) return;
      invalidateCurrentCaches({ google: true, planned: true });
      closeDraftPlan();
    }
    if (checkpoint) {
      onboardingGuide?.onGoalCreated(checkpoint.id);
    }
    if (onboardingGuide?.step === "goal-create") {
      onboardingGuide.onStepChange("proof");
    }
    await load();
  };

  const saveOtherEvent = async (title: string) => {
    if (!otherEventRange || isCreatingOtherEvent) return;

    setIsCreatingOtherEvent(true);
    try {
      const response = await createGoogleCalendarEvent({
        dateKey,
        endTime: formatPlanApiTime(otherEventRange.endMinutes),
        startTime: formatPlanApiTime(otherEventRange.startMinutes),
        timeZone,
        title,
      });

      if (response.status !== "synced") {
        throw new Error(getGoogleCalendarStatusMessage(response.status));
      }

      if (!isMountedRef.current) return;
      setOtherEventRange(null);
      invalidateCurrentCaches({ google: true });
      await load();
    } catch (eventError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not add event",
        eventError instanceof Error
          ? eventError.message
          : "The Google Calendar event could not be created.",
      );
    } finally {
      if (isMountedRef.current) setIsCreatingOtherEvent(false);
    }
  };

  const createPlanFromDrag = async (
    targetType: PlanTargetType,
    targetId: string,
  ) => {
    if (!draftPlanRange || isCreatingPlan) return;

    const startTime = formatPlanApiTime(draftPlanRange.startMinutes);
    const endTime = formatPlanApiTime(draftPlanRange.endMinutes);
    setIsCreatingPlan(true);

    try {
      if (targetType === "task") {
        const task = taskById.get(targetId);
        if (!task) throw new Error("Could not find that task.");

        await upsertPlannedEvent({
          dateKey,
          endTime,
          sourceId: task.id,
          sourceType: "task",
          startTime,
          timeZone,
          title: task.name,
        });
        invalidateCurrentCaches({ google: true, planned: true });
      } else if (targetType === "goal") {
        const checkpoint = checkpointById.get(targetId);
        if (!checkpoint) throw new Error("Could not find that checkpoint.");

        await upsertPlannedEvent({
          dateKey,
          endTime,
          sourceId: checkpoint.checkpoint.id,
          sourceType: "goal_checkpoint",
          startTime,
          timeZone,
          title: checkpoint.checkpoint.title,
        });
        invalidateCurrentCaches({ google: true, planned: true });
      } else {
        const habit = habitById.get(targetId);
        if (!habit) throw new Error("Could not find that habit.");

        await setHabitLog(habit.id, dateKey, "planned", {
          endTime,
          startTime,
          timeZone,
        });
        invalidateCurrentCaches({ google: true, snapshot: true });
      }

      if (!isMountedRef.current) return;
      closeDraftPlan();
      await load();
    } catch (planError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not add plan",
        planError instanceof Error
          ? planError.message
          : "The plan could not be created.",
      );
    } finally {
      if (isMountedRef.current) setIsCreatingPlan(false);
    }
  };

  return (
    <ComponentErrorBoundary name="DayPlanScreen">
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: tabBarHeight + 24 },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                tintColor={theme.primary}
                onRefresh={() => void load({ force: true, refreshing: true })}
              />
            }
            scrollEnabled={!isTimelineDragging}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <PlanReportHeaderMenu currentView="day-plan" />
              </View>
              <View style={styles.dateControls}>
                <Pressable
                  accessibilityLabel="Previous day"
                  hitSlop={8}
                  onPress={() => moveDate(-1)}
                  style={({ pressed }) => [
                    styles.iconButton,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("chevron.left", "chevron_left")}
                    size={16}
                    tintColor={theme.tabIcon}
                    weight="semibold"
                  />
                </Pressable>
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
                <Pressable
                  accessibilityLabel="Next day"
                  hitSlop={8}
                  onPress={() => moveDate(1)}
                  style={({ pressed }) => [
                    styles.iconButton,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("chevron.right", "chevron_right")}
                    size={16}
                    tintColor={theme.tabIcon}
                    weight="semibold"
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.dateHeader}>
              <View
                style={[
                  styles.dayBadge,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <Text style={[styles.weekday, { color: theme.primary }]}>
                  {WEEKDAY_NAMES[selectedDate.getDay()]}
                </Text>
                <Text style={[styles.dayNumber, { color: theme.text }]}>
                  {selectedDate.getDate()}
                </Text>
              </View>
              <View style={styles.dateTextBlock}>
                <Text style={[styles.dateTitle, { color: theme.text }]}>
                  {MONTH_NAMES[selectedDate.getMonth()]}{" "}
                  {selectedDate.getFullYear()}
                </Text>
                <Text
                  style={[styles.dateSubtitle, { color: theme.textSecondary }]}
                >
                  Planned habits, tasks, and goals in primary color, completed
                  in secondary color, and other events in gray
                </Text>
              </View>
            </View>

            {googleStatus !== "synced" ? (
              <View
                style={[
                  styles.notice,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <Text style={[styles.noticeText, { color: theme.text }]}>
                  Google Calendar is not connected. Planned habits will still
                  show here.
                </Text>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => void load({ force: true })}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {isLoading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={theme.primary} size="large" />
              </View>
            ) : (
              <>
                {allDayEntries.length > 0 ? (
                  <View
                    style={[
                      styles.allDaySection,
                      {
                        backgroundColor: theme.tabBar,
                        borderColor: theme.tabBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.allDayLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      All day
                    </Text>
                    <View style={styles.allDayChips}>
                      {allDayEntries.map((entry) => (
                        <EntryChip
                          entry={entry}
                          key={entry.id}
                          onPress={
                            entry.kind !== "google"
                              ? () => openInternalEntry(entry)
                              : undefined
                          }
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.timelineCard,
                    {
                      backgroundColor: theme.tabBar,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  <ScrollView
                    ref={timelineScrollRef}
                    contentOffset={{ x: 0, y: TIMELINE_INITIAL_OFFSET }}
                    nestedScrollEnabled
                    onScroll={(event) => {
                      timelineScrollYRef.current =
                        event.nativeEvent.contentOffset.y;
                    }}
                    scrollEnabled={!isTimelineDragging}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    style={styles.timelineScroller}
                  >
                    <View style={styles.timeline}>
                      {HOURS.map((hour) => (
                        <View
                          key={hour}
                          style={[styles.hourRow, { height: HOUR_HEIGHT }]}
                        >
                          <Text
                            style={[
                              styles.hourLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {formatHour(hour)}
                          </Text>
                          <View
                            style={[
                              styles.hourLine,
                              { borderTopColor: theme.tabBorder },
                            ]}
                          />
                        </View>
                      ))}
                      <View
                        onLayout={(event) => {
                          timelineDragLayerWidthRef.current =
                            event.nativeEvent.layout.width;
                        }}
                        onStartShouldSetResponder={() => !isPlanSheetOpen}
                        onResponderGrant={handleTimelineResponderGrant}
                        onResponderMove={handleTimelineResponderMove}
                        onResponderRelease={handleTimelineResponderRelease}
                        onResponderTerminate={cancelTimelineGesture}
                        onResponderTerminationRequest={() =>
                          !timelineGestureRef.current
                        }
                        style={styles.dragLayer}
                      />
                      <View style={styles.eventLayer} pointerEvents="box-none">
                        {timedEntries.map((entry) => (
                          <TimedEntryBlock
                            entry={entry}
                            key={entry.id}
                            onLongPress={(event) =>
                              beginMoveEntry(entry, event)
                            }
                            onPress={
                              entry.kind !== "google"
                                ? () => openInternalEntry(entry)
                                : undefined
                            }
                            onPressMove={handleTimelinePressMove}
                            onPressOut={finishTimelineGesture}
                          />
                        ))}
                        {dragPlanRange ? (
                          <DraftPlanBlock range={dragPlanRange} />
                        ) : null}
                      </View>
                      {isViewingToday ? (
                        <View
                          pointerEvents="none"
                          style={[styles.nowIndicator, { top: nowLineTop }]}
                        >
                          <View style={styles.nowDot} />
                          <View style={styles.nowLine} />
                        </View>
                      ) : null}
                    </View>
                  </ScrollView>
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>

        <GoalActionsModal
          goal={activeHabit}
          visible={Boolean(activeHabit)}
          hasNote={Boolean(
            activeKey && snapshot?.notesByHabitDate[activeKey]?.trim(),
          )}
          noteText={activeKey ? snapshot?.notesByHabitDate[activeKey] : null}
          hasPhoto={Boolean(
            activeKey && (snapshot?.photoCountsByHabitDate[activeKey] ?? 0) > 0,
          )}
          visibility={
            activeKey
              ? (snapshot?.visibilityByHabitDate[activeKey] ?? "only_me")
              : "only_me"
          }
          status={activeKey ? snapshot?.logsByHabitDate[activeKey] : undefined}
          isUpdating={Boolean(activeKey && updatingKey === activeKey)}
          isUpdatingVisibility={Boolean(activeKey && updatingKey === activeKey)}
          canPlan={isTodayOrFutureDate(selectedDate)}
          isFutureDate={isFutureDate(selectedDate)}
          plannedTime={activePlannedTime}
          uploadingPhotoSource={uploadingPhotoSource}
          onAddPhoto={(source) => {
            if (!activeHabit) return;
            void addPhoto(activeHabit.id, source);
          }}
          onOpenNote={() => {
            if (!activeHabit) return;
            setNoteHabit(activeHabit);
            setActiveHabit(null);
          }}
          onSetVisibility={(visibility) => void setActiveVisibility(visibility)}
          onSetStatus={(status, options) =>
            void setActiveStatus(status, options)
          }
          onDismiss={() => setActiveHabit(null)}
          onShown={() => undefined}
        />
        <InternalEventActionsModal
          entry={activeEntry}
          isUpdating={Boolean(
            activeEntry?.sourceId &&
              updatingKey === `${activeEntry.kind}-${activeEntry.sourceId}`,
          )}
          onboardingStep={
            activeEntry?.kind === "goal" &&
            activeEntry.sourceId === onboardingGuide?.createdGoalCheckpointId
              ? onboardingStep
              : null
          }
          statusLabel={getInternalEntryStatusLabel(
            activeEntry,
            taskById,
            checkpointById,
          )}
          visibility={activeCheckpoint?.checkpoint.visibility ?? "only_me"}
          onAddPhoto={() => void addCheckpointPhotoForActiveEntry("library")}
          onClose={() => setActiveEntry(null)}
          onDelete={() => void deleteActiveEntry()}
          onOpenNote={openAttachmentForActiveEntry}
          onSetVisibility={(visibility) =>
            void setActiveCheckpointVisibility(visibility)
          }
          onTakePhoto={() => void addCheckpointPhotoForActiveEntry("camera")}
          onToggleComplete={() => void completeActiveEntry()}
        />
        <PlanSelectionModal
          dailyHabitOptions={dailyHabitOptions}
          goalOptions={goalOptions}
          hidden={creatingTargetType !== null}
          isSaving={isCreatingPlan}
          monthlyHabitOptions={monthlyHabitOptions}
          onboardingStep={onboardingStep}
          range={draftPlanRange}
          selectedType={selectedPlanTargetType}
          taskOptions={taskOptions}
          onClose={closeDraftPlan}
          onCreate={(targetType) => {
            if (onboardingGuide && targetType !== "goal") return;
            if (onboardingGuide?.step === "goal-create") {
              onboardingGuide.onStepChange("goal-create");
            }
            setCreatingTargetType(targetType);
          }}
          onCreateOtherEvent={openOtherEventForm}
          onOnboardingNext={(step) => onboardingGuide?.onStepChange(step)}
          onSelectOption={(targetType, targetId) =>
            void createPlanFromDrag(targetType, targetId)
          }
          onSelectType={(targetType) => {
            if (onboardingGuide && targetType && targetType !== "goal") return;
            setSelectedPlanTargetType(targetType);
            if (
              targetType === "goal" &&
              onboardingGuide?.step === "select-goal"
            ) {
              onboardingGuide.onStepChange("goal-create");
            }
          }}
        />
        <OtherEventFormModal
          isSaving={isCreatingOtherEvent}
          range={otherEventRange}
          onClose={() => setOtherEventRange(null)}
          onSave={(title) => void saveOtherEvent(title)}
        />
        <TaskFormModal
          isOpen={creatingTargetType === "task"}
          onClose={() => setCreatingTargetType(null)}
          onCreateProject={createProject}
          onSave={saveCreatedTask}
          projects={projects}
          task={null}
        />
        <HabitFormModal
          categories={habitCategories}
          habit={null}
          initialValues={{
            period: creatingTargetType === "monthlyHabit" ? "monthly" : "daily",
          }}
          isOpen={
            creatingTargetType === "dailyHabit" ||
            creatingTargetType === "monthlyHabit"
          }
          onAddCategory={createCategory}
          onClose={() => setCreatingTargetType(null)}
          onSave={saveCreatedHabit}
        />
        <GoalFormModal
          goal={null}
          initialValues={
            onboardingGuide
              ? {
                  title: "I joined float",
                  checkpoints: [
                    {
                      completed: false,
                      targetDate: dateKey,
                      title: "Join float",
                    },
                  ],
                }
              : undefined
          }
          isOpen={creatingTargetType === "goal"}
          onClose={() => setCreatingTargetType(null)}
          onSave={saveCreatedGoal}
          saveHint={
            onboardingGuide
              ? "The goal is ready. Tap Save to put its first checkpoint on your calendar."
              : undefined
          }
        />
        {noteHabit ? (
          <GoalNoteEditorModal
            dateKey={dateKey}
            goalName={noteHabit.name}
            initialValue={
              snapshot?.notesByHabitDate[`${noteHabit.id}_${dateKey}`] ?? null
            }
            onClose={() => setNoteHabit(null)}
            onSave={async (notes) => {
              await saveNote(noteHabit.id, notes);
              setActiveHabit(noteHabit);
            }}
          />
        ) : null}
        {noteCheckpoint ? (
          <GoalNoteEditorModal
            dateKey={dateKey}
            goalName={noteCheckpoint.ref.checkpoint.title}
            initialValue={noteCheckpoint.ref.checkpoint.notes}
            onClose={() => setNoteCheckpoint(null)}
            onSave={async (notes) => {
              await saveCheckpointNote(noteCheckpoint, notes);
            }}
          />
        ) : null}
        <DayPlanOnboardingOverlay
          onComplete={onboardingGuide?.onComplete}
          onNext={onboardingGuide?.onStepChange}
          step={onboardingStep}
        />
      </View>
    </ComponentErrorBoundary>
  );
}

function DayPlanOnboardingOverlay({
  onComplete,
  onNext,
  step,
}: {
  onComplete?: () => void;
  onNext?: (step: DayPlanOnboardingStep) => void;
  step: DayPlanOnboardingStep | null;
}) {
  if (
    !step ||
    step === "task-info" ||
    step === "goal-info" ||
    step === "habit-info" ||
    step === "select-goal" ||
    step === "goal-create" ||
    step === "mark-complete"
  ) {
    return null;
  }

  const content: Record<
    Exclude<
      DayPlanOnboardingStep,
      | "task-info"
      | "goal-info"
      | "habit-info"
      | "select-goal"
      | "goal-create"
      | "mark-complete"
    >,
    {
      body: string;
      buttonLabel?: string;
      next?: DayPlanOnboardingStep;
      title: string;
    }
  > = {
    drag: {
      body: "Click and drag to add to your calendar. This will be in sync with Google Calendar.",
      title: "Add your first plan",
    },
    proof: {
      body: "Tap the goal checkpoint you just added, then add a selfie with a thumbs up.",
      title: "Add proof",
    },
    "journal-info": {
      body: "Friends can see your posts if you make the post public.",
      buttonLabel: "Next",
      next: "friends-info",
      title: "Share intentionally",
    },
    "friends-info": {
      body: "This completes your onboarding. Feel free to explore the incentives, shared goals, and dashboard pages next!",
      buttonLabel: "Finish",
      next: "done",
      title: "You are ready",
    },
    done: {
      body: "This completes your onboarding. Feel free to explore the incentives, shared goals, and dashboard pages next!",
      buttonLabel: "Finish",
      title: "You are ready",
    },
  };
  const item = content[step];

  return (
    <View pointerEvents="box-none" style={styles.onboardingOverlay}>
      <OnboardingTooltipCard
        body={item.body}
        buttonLabel={item.buttonLabel}
        onPress={() => {
          if (item.next === "done" || step === "done") {
            onComplete?.();
            return;
          }
          if (item.next) onNext?.(item.next);
        }}
        title={item.title}
      />
    </View>
  );
}

function OnboardingTooltipCard({
  body,
  buttonLabel,
  onPress,
  title,
}: {
  body: string;
  buttonLabel?: string;
  onPress?: () => void;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.onboardingTooltip,
        { backgroundColor: theme.background, borderColor: theme.tabBorder },
      ]}
    >
      <Text style={[styles.onboardingTooltipTitle, { color: theme.text }]}>
        {title}
      </Text>
      <Text
        style={[styles.onboardingTooltipBody, { color: theme.textSecondary }]}
      >
        {body}
      </Text>
      {buttonLabel && onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            styles.onboardingTooltipButton,
            { backgroundColor: theme.primary },
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.onboardingTooltipButtonText,
              { color: theme.primaryForeground },
            ]}
          >
            {buttonLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function getPlanPickerOnboardingTooltip(step: DayPlanOnboardingStep | null): {
  body: string;
  buttonLabel?: string;
  next?: DayPlanOnboardingStep;
  title: string;
} | null {
  if (step === "task-info") {
    return {
      body: "Tasks are important or urgent items on your to-do list.",
      buttonLabel: "Next",
      next: "goal-info",
      title: "Tasks",
    };
  }
  if (step === "goal-info") {
    return {
      body: "Goals are definite accomplishments with checkpoints of progression.",
      buttonLabel: "Next",
      next: "habit-info",
      title: "Goals",
    };
  }
  if (step === "habit-info") {
    return {
      body: "Daily Habits and Monthly Habits are systems to help you achieve goals. Let's start with a goal.",
      buttonLabel: "Next",
      next: "select-goal",
      title: "Habits",
    };
  }
  if (step === "select-goal") {
    return {
      body: "Select Goal to continue.",
      title: "Start with a goal",
    };
  }
  if (step === "goal-create") {
    return {
      body: "Tap the plus button, then tap Save. The goal is already filled in for you.",
      title: "Create your first goal",
    };
  }
  return null;
}

function InternalEventActionsModal({
  entry,
  isUpdating,
  onboardingStep,
  onAddPhoto,
  onClose,
  onDelete,
  onOpenNote,
  onSetVisibility,
  onTakePhoto,
  onToggleComplete,
  statusLabel,
  visibility,
}: {
  entry: DayPlanEntry | null;
  isUpdating: boolean;
  onboardingStep: DayPlanOnboardingStep | null;
  onAddPhoto: () => void;
  onClose: () => void;
  onDelete: () => void;
  onOpenNote: () => void;
  onSetVisibility: (visibility: HabitVisibility) => void;
  onTakePhoto: () => void;
  onToggleComplete: () => void;
  statusLabel: string;
  visibility: HabitVisibility;
}) {
  const theme = useTheme();
  if (!entry) return null;

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.sheetBackdrop]}
          onPress={onClose}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[
            styles.eventActionSheet,
            { backgroundColor: theme.background },
          ]}
        >
          <View
            style={[
              styles.eventActionHeader,
              {
                backgroundColor: theme.tabBar,
                borderBottomColor: theme.tabBorder,
              },
            ]}
          >
            <View style={styles.eventActionTitleBlock}>
              <Text
                numberOfLines={2}
                style={[styles.eventActionTitle, { color: theme.text }]}
              >
                {entry.title}
              </Text>
              <Text
                style={[
                  styles.eventActionSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                {entry.kind === "task" ? "Task" : "Goal checkpoint"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.eventActionCloseButton,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("xmark", "close")}
                size={14}
                tintColor={theme.tabIcon}
                weight="bold"
              />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.eventActionContent}
            showsVerticalScrollIndicator={false}
          >
            {onboardingStep === "proof" ? (
              <OnboardingTooltipCard
                body="Take a quick selfie with a thumbs up, or choose one from your library."
                title="Add proof"
              />
            ) : null}
            {onboardingStep === "mark-complete" ? (
              <OnboardingTooltipCard
                body="Mark complete. All events with a note or photo will be added to your journal."
                title="Finish the goal"
              />
            ) : null}
            <Pressable
              disabled={isUpdating}
              onPress={onToggleComplete}
              style={({ pressed }) => [
                styles.eventActionRow,
                { backgroundColor: theme.backgroundElement },
                onboardingStep === "mark-complete" && styles.onboardingGlow,
                pressed && styles.pressed,
              ]}
            >
              {isUpdating ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <SymbolView
                  name={sym(
                    statusLabel === "Reopen"
                      ? "arrow.uturn.backward.circle.fill"
                      : "checkmark.circle.fill",
                    statusLabel === "Reopen" ? "undo" : "check_circle",
                  )}
                  size={26}
                  tintColor={
                    statusLabel === "Reopen"
                      ? theme.textSecondary
                      : theme.primary
                  }
                />
              )}
              <Text style={[styles.eventActionLabel, { color: theme.text }]}>
                {statusLabel}
              </Text>
            </Pressable>

            <View style={styles.eventActionGrid}>
              <Pressable
                onPress={onTakePhoto}
                style={({ pressed }) => [
                  styles.eventActionTile,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("camera.fill", "photo_camera")}
                  size={28}
                  tintColor={theme.primary}
                />
                <Text
                  style={[styles.eventActionTileLabel, { color: theme.text }]}
                >
                  Take photo
                </Text>
              </Pressable>
              <Pressable
                onPress={onAddPhoto}
                style={({ pressed }) => [
                  styles.eventActionTile,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("photo.fill", "image")}
                  size={28}
                  tintColor={theme.primary}
                />
                <Text
                  style={[styles.eventActionTileLabel, { color: theme.text }]}
                >
                  Add photo
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={onOpenNote}
              style={({ pressed }) => [
                styles.eventActionRow,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("note.text", "notes")}
                size={26}
                tintColor={theme.primary}
              />
              <Text style={[styles.eventActionLabel, { color: theme.text }]}>
                Add note
              </Text>
            </Pressable>

            {entry.kind === "goal" ? (
              <GoalLogVisibilityControl
                allowed={["only_me", "all_friends"]}
                disabled={isUpdating}
                value={visibility}
                onChange={onSetVisibility}
              />
            ) : null}

            <Pressable
              disabled={isUpdating}
              onPress={onDelete}
              style={({ pressed }) => [
                styles.eventActionRow,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("trash.fill", "delete")}
                size={26}
                tintColor="#B84D54"
              />
              <Text style={[styles.eventActionLabel, { color: "#B84D54" }]}>
                Delete event
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function PlanSelectionModal({
  dailyHabitOptions,
  goalOptions,
  hidden,
  isSaving,
  monthlyHabitOptions,
  onClose,
  onCreate,
  onCreateOtherEvent,
  onOnboardingNext,
  onSelectOption,
  onSelectType,
  onboardingStep,
  range,
  selectedType,
  taskOptions,
}: {
  dailyHabitOptions: PlanTargetOption[];
  goalOptions: PlanTargetOption[];
  hidden: boolean;
  isSaving: boolean;
  monthlyHabitOptions: PlanTargetOption[];
  onClose: () => void;
  onCreate: (targetType: PlanTargetType) => void;
  onCreateOtherEvent: () => void;
  onOnboardingNext?: (step: DayPlanOnboardingStep) => void;
  onSelectOption: (targetType: PlanTargetType, targetId: string) => void;
  onSelectType: (targetType: PlanTargetType | null) => void;
  onboardingStep: DayPlanOnboardingStep | null;
  range: PlanRange | null;
  selectedType: PlanTargetType | null;
  taskOptions: PlanTargetOption[];
}) {
  const theme = useTheme();
  if (!range) return null;

  const optionsByType: Record<PlanTargetType, PlanTargetOption[]> = {
    dailyHabit: dailyHabitOptions,
    goal: goalOptions,
    monthlyHabit: monthlyHabitOptions,
    task: taskOptions,
  };
  const selectedOptions = selectedType ? optionsByType[selectedType] : [];
  const selectedMeta = selectedType ? getPlanTargetMeta(selectedType) : null;
  const onboardingTooltip = getPlanPickerOnboardingTooltip(onboardingStep);
  const restrictToGoal = Boolean(onboardingStep);
  // Keep every option disabled during the intro steps, until the
  // "Start with a goal" (select-goal) prompt appears.
  const optionsLocked =
    onboardingStep === "task-info" ||
    onboardingStep === "goal-info" ||
    onboardingStep === "habit-info";
  const allowClose = !onboardingStep;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={!hidden}
      onRequestClose={allowClose ? onClose : undefined}
    >
      <View style={styles.sheetOverlay}>
        <Pressable
          disabled={!allowClose}
          style={[StyleSheet.absoluteFill, styles.sheetBackdrop]}
          onPress={onClose}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.actionSheet, { backgroundColor: theme.background }]}
        >
          <View style={styles.planPickerHeader}>
            {selectedType ? (
              <Pressable
                accessibilityLabel="Back to plan types"
                disabled={!allowClose}
                hitSlop={8}
                onPress={() => onSelectType(null)}
                style={({ pressed }) => [
                  styles.planPickerBackButton,
                  { backgroundColor: theme.backgroundElement },
                  !allowClose && styles.disabledButton,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("chevron.left", "chevron_left")}
                  size={16}
                  tintColor={theme.tabIcon}
                  weight="semibold"
                />
              </Pressable>
            ) : null}
            <View style={styles.planPickerTitleBlock}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>
                {selectedMeta
                  ? `Choose ${selectedMeta.label.toLowerCase()}`
                  : "Add to calendar"}
              </Text>
              <Text
                style={[styles.actionSubtitle, { color: theme.textSecondary }]}
              >
                {formatMinuteRange(range.startMinutes, range.endMinutes)}
              </Text>
            </View>
            {selectedType ? (
              <Pressable
                accessibilityLabel={`Create ${selectedMeta?.label.toLowerCase()}`}
                disabled={restrictToGoal && selectedType !== "goal"}
                onPress={() => onCreate(selectedType)}
                style={({ pressed }) => [
                  styles.planPickerCreateButton,
                  { backgroundColor: theme.primary },
                  onboardingStep === "goal-create" && styles.onboardingGlow,
                  restrictToGoal &&
                    selectedType !== "goal" &&
                    styles.disabledButton,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("plus", "add")}
                  size={19}
                  tintColor={theme.primaryForeground}
                  weight="bold"
                />
              </Pressable>
            ) : null}
          </View>

          {onboardingTooltip ? (
            <OnboardingTooltipCard
              body={onboardingTooltip.body}
              buttonLabel={onboardingTooltip.buttonLabel}
              onPress={
                onboardingTooltip.next
                  ? () => {
                      const nextStep = onboardingTooltip.next;
                      if (nextStep) onOnboardingNext?.(nextStep);
                    }
                  : undefined
              }
              title={onboardingTooltip.title}
            />
          ) : null}

          {selectedType ? (
            <ScrollView
              contentContainerStyle={styles.planPickerList}
              showsVerticalScrollIndicator={false}
              style={styles.planPickerScroll}
            >
              {selectedOptions.length > 0 ? (
                selectedOptions.map((option) => (
                  <Pressable
                    disabled={isSaving || Boolean(onboardingStep)}
                    key={option.id}
                    onPress={() => onSelectOption(selectedType, option.id)}
                    style={({ pressed }) => [
                      styles.planPickerOptionRow,
                      { backgroundColor: theme.backgroundElement },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.planPickerOptionText}>
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.planPickerOptionTitle,
                          { color: theme.text },
                        ]}
                      >
                        {option.title}
                      </Text>
                      {option.subtitle ? (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.planPickerOptionSubtitle,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {option.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {isSaving ? (
                      <ActivityIndicator color={theme.primary} size="small" />
                    ) : (
                      <SymbolView
                        name={sym("plus.circle.fill", "add_circle")}
                        size={24}
                        tintColor={theme.primary}
                      />
                    )}
                  </Pressable>
                ))
              ) : (
                <Text
                  style={[
                    styles.planPickerEmpty,
                    { color: theme.textSecondary },
                  ]}
                >
                  {selectedMeta?.emptyText ?? "Nothing to plan here yet."}
                </Text>
              )}
            </ScrollView>
          ) : (
            <View style={styles.planPickerList}>
              {(
                [
                  "task",
                  "monthlyHabit",
                  "dailyHabit",
                  "goal",
                  "otherEvent",
                ] as const
              ).map((targetType) => {
                const isOtherEvent = targetType === "otherEvent";
                const disabled =
                  optionsLocked ||
                  (restrictToGoal && (isOtherEvent || targetType !== "goal"));
                const meta = isOtherEvent
                  ? {
                      icon: sym("calendar.badge.plus", "event_available"),
                      label: "Other event",
                    }
                  : getPlanTargetMeta(targetType);
                const count = isOtherEvent
                  ? null
                  : optionsByType[targetType].length;

                return (
                  <Pressable
                    disabled={disabled}
                    key={targetType}
                    onPress={() =>
                      isOtherEvent
                        ? onCreateOtherEvent()
                        : onSelectType(targetType)
                    }
                    style={({ pressed }) => [
                      styles.planPickerTypeRow,
                      { backgroundColor: theme.backgroundElement },
                      targetType === "goal" &&
                        onboardingStep === "select-goal" &&
                        styles.onboardingGlow,
                      disabled && styles.onboardingDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.planPickerTypeIcon,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <SymbolView
                        name={meta.icon}
                        size={23}
                        tintColor={theme.primary}
                        weight="semibold"
                      />
                    </View>
                    <View style={styles.planPickerOptionText}>
                      <Text
                        style={[
                          styles.planPickerOptionTitle,
                          { color: theme.text },
                        ]}
                      >
                        {meta.label}
                      </Text>
                      <Text
                        style={[
                          styles.planPickerOptionSubtitle,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {isOtherEvent
                          ? "Google Calendar"
                          : `${count} available`}
                      </Text>
                    </View>
                    <SymbolView
                      name={sym("chevron.right", "chevron_right")}
                      size={16}
                      tintColor={theme.tabIcon}
                      weight="semibold"
                    />
                  </Pressable>
                );
              })}
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function OtherEventFormModal({
  isSaving,
  onClose,
  onSave,
  range,
}: {
  isSaving: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
  range: PlanRange | null;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (range) setTitle("");
  }, [range]);

  if (!range) return null;

  const trimmedTitle = title.trim();

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetOverlay}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, styles.sheetBackdrop]}
          onPress={onClose}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.actionSheet, { backgroundColor: theme.background }]}
        >
          <View style={styles.otherEventHeader}>
            <View style={styles.planPickerTitleBlock}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>
                Other event
              </Text>
              <Text
                style={[styles.actionSubtitle, { color: theme.textSecondary }]}
              >
                {formatMinuteRange(range.startMinutes, range.endMinutes)}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.planPickerBackButton,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("xmark", "close")}
                size={14}
                tintColor={theme.tabIcon}
                weight="bold"
              />
            </Pressable>
          </View>

          <View style={styles.otherEventForm}>
            <TextInput
              autoFocus
              editable={!isSaving}
              maxLength={200}
              onChangeText={setTitle}
              placeholder="Event title"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              selectionColor={theme.primary}
              style={[
                styles.otherEventInput,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                },
              ]}
              value={title}
              onSubmitEditing={() => {
                if (trimmedTitle && !isSaving) onSave(trimmedTitle);
              }}
            />
            <Pressable
              disabled={!trimmedTitle || isSaving}
              onPress={() => onSave(trimmedTitle)}
              style={({ pressed }) => [
                styles.otherEventSaveButton,
                {
                  backgroundColor: trimmedTitle
                    ? theme.primary
                    : theme.backgroundElement,
                },
                (!trimmedTitle || isSaving) && styles.disabledButton,
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
                    styles.otherEventSaveText,
                    {
                      color: trimmedTitle
                        ? theme.primaryForeground
                        : theme.textSecondary,
                    },
                  ]}
                >
                  Add event
                </Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DraftPlanBlock({ range }: { range: PlanRange }) {
  const theme = useTheme();
  const top = (range.startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(
    ((range.endMinutes - range.startMinutes) / 60) * HOUR_HEIGHT,
    MIN_EVENT_HEIGHT,
  );

  return (
    <View
      pointerEvents="none"
      style={[
        styles.draftPlanBlock,
        {
          backgroundColor: withHexAlpha(theme.primary, "26"),
          borderColor: theme.primary,
          height,
          top,
        },
      ]}
    >
      <Text style={[styles.draftPlanText, { color: theme.primary }]}>
        {formatMinuteRange(range.startMinutes, range.endMinutes)}
      </Text>
    </View>
  );
}

function getInternalEntryStatusLabel(
  entry: DayPlanEntry | null,
  taskById: Map<string, Task>,
  checkpointById: Map<string, CheckpointRef>,
) {
  if (!entry?.sourceId) return "Mark complete";

  if (entry.kind === "task") {
    return taskById.get(entry.sourceId)?.completedAt
      ? "Reopen"
      : "Mark complete";
  }

  if (entry.kind === "goal") {
    return checkpointById.get(entry.sourceId)?.checkpoint.completed
      ? "Reopen"
      : "Mark complete";
  }

  return "Mark complete";
}

function EntryChip({
  entry,
  onPress,
}: {
  entry: DayPlanEntry;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { backgroundColor, color } = getEntryColors(entry, theme);

  const chip = (
    <View style={[styles.allDayChip, { backgroundColor }]}>
      <Text numberOfLines={1} style={[styles.allDayChipText, { color }]}>
        {entry.title}
      </Text>
    </View>
  );

  if (!onPress) return chip;

  return (
    <Pressable
      accessibilityLabel={`Open ${entry.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {chip}
    </Pressable>
  );
}

function TimedEntryBlock({
  entry,
  onLongPress,
  onPress,
  onPressMove,
  onPressOut,
}: {
  entry: DayPlanEntry;
  onLongPress?: (event: GestureResponderEvent) => void;
  onPress?: () => void;
  onPressMove?: (event: GestureResponderEvent) => void;
  onPressOut?: () => void;
}) {
  const theme = useTheme();
  const { backgroundColor, color } = getEntryColors(entry, theme);
  const top = (entry.startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(
    ((entry.endMinutes - entry.startMinutes) / 60) * HOUR_HEIGHT,
    MIN_EVENT_HEIGHT,
  );
  const laneWidth = 100 / Math.max(entry.laneCount, 1);
  const left = laneWidth * entry.laneIndex;
  const isCompact = height <= 38;
  const timeLabel = isCompact
    ? formatMinuteRangeCompact(entry.startMinutes, entry.endMinutes)
    : formatMinuteRange(entry.startMinutes, entry.endMinutes);

  const content = isCompact ? (
    <View
      style={[styles.eventBlock, styles.eventBlockCompact, { backgroundColor }]}
    >
      <Text
        numberOfLines={1}
        style={[styles.eventTitle, styles.eventTitleCompact, { color }]}
      >
        {entry.title}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.eventTime, styles.eventTimeCompact, { color }]}
      >
        {timeLabel}
      </Text>
    </View>
  ) : (
    <View style={[styles.eventBlock, { backgroundColor }]}>
      <Text
        numberOfLines={height >= 62 ? 2 : 1}
        style={[styles.eventTitle, { color }]}
      >
        {entry.title}
      </Text>
      <Text numberOfLines={1} style={[styles.eventTime, { color }]}>
        {timeLabel}
      </Text>
    </View>
  );

  return (
    <View
      pointerEvents={onPress || onLongPress ? "auto" : "none"}
      style={[
        styles.eventOuter,
        {
          height,
          left: `${left}%`,
          top,
          width: `${laneWidth}%`,
        },
      ]}
    >
      {onPress || onLongPress ? (
        <Pressable
          accessibilityLabel={`Open ${entry.title}`}
          accessibilityRole="button"
          delayLongPress={LONG_PRESS_DELAY_MS}
          onLongPress={onLongPress}
          onPress={onPress}
          onPressMove={onPressMove}
          onPressOut={onPressOut}
          style={({ pressed }) => [
            styles.eventPressable,
            pressed && styles.pressed,
          ]}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
    </View>
  );
}

function getEntryColors(
  entry: DayPlanEntry,
  theme: ReturnType<typeof useTheme>,
) {
  if (entry.kind === "google") {
    return {
      backgroundColor: theme.backgroundSelected,
      color: theme.text,
    };
  }

  if (!entry.completed) {
    return {
      backgroundColor: theme.primary,
      color: theme.primaryForeground,
    };
  }

  return {
    backgroundColor: theme.secondary,
    color: theme.secondaryForeground,
  };
}

function buildDayPlanEntries({
  checkpointById,
  dateKey,
  googleEvents,
  habitById,
  plannedEvents,
  selectedDate,
  snapshot,
  taskById,
}: {
  checkpointById: Map<string, CheckpointRef>;
  dateKey: string;
  googleEvents: GoogleCalendarDayEvent[];
  habitById: Map<string, ActionHabit>;
  plannedEvents: PlannedEvent[];
  selectedDate: Date;
  snapshot: HabitLogsSnapshot | null;
  taskById: Map<string, Task>;
}): DayPlanEntry[] {
  const dayStart = startOfDay(selectedDate);
  const dayEnd = addDays(dayStart, 1);
  const entries: DayPlanEntry[] = [];

  for (const event of googleEvents) {
    const entry = googleEventToEntry(event, dayStart, dayEnd);
    if (entry) entries.push(entry);
  }

  for (const event of plannedEvents) {
    const entry = plannedEventToEntry(event, { checkpointById, taskById });
    if (entry) entries.push(entry);
  }

  if (snapshot) {
    for (const habit of habitById.values()) {
      const key = `${habit.id}_${dateKey}`;
      const status = snapshot.logsByHabitDate[key];

      const plannedTime = snapshot.plannedTimesByHabitDate[key];
      const startMinutes = timeToMinutes(plannedTime?.startTime);
      const endMinutes = timeToMinutes(plannedTime?.endTime);
      const hasTimeRange = startMinutes !== null && endMinutes !== null;
      if (status !== "planned" && !(status === "complete" && hasTimeRange)) {
        continue;
      }

      entries.push({
        allDay: !hasTimeRange,
        completed: status === "complete",
        endMinutes: hasTimeRange
          ? normalizeEndMinutes(startMinutes, endMinutes)
          : MINUTES_IN_DAY,
        habitId: habit.id,
        id: `habit-${habit.id}`,
        kind: "habit",
        laneCount: 1,
        laneIndex: 0,
        startMinutes: hasTimeRange ? startMinutes : 0,
        title: habit.name,
      });
    }

    // Project "repeat daily" plans onto every day from their origin forward,
    // unless the day already has its own log (which is handled above / wins).
    for (const habit of habitById.values()) {
      const plan = snapshot.repeatingPlansByHabit?.[habit.id];
      if (!plan || dateKey < plan.originDate) continue;
      if (snapshot.explicitPlanDatesByHabit?.[habit.id]?.includes(dateKey)) {
        continue;
      }
      if (snapshot.logsByHabitDate[`${habit.id}_${dateKey}`] === "complete") {
        continue;
      }

      const startMinutes = timeToMinutes(plan.startTime);
      const endMinutes = timeToMinutes(plan.endTime);
      const hasTimeRange = startMinutes !== null && endMinutes !== null;

      entries.push({
        allDay: !hasTimeRange,
        endMinutes: hasTimeRange
          ? normalizeEndMinutes(startMinutes, endMinutes)
          : MINUTES_IN_DAY,
        habitId: habit.id,
        id: `habit-${habit.id}`,
        kind: "habit",
        laneCount: 1,
        laneIndex: 0,
        startMinutes: hasTimeRange ? startMinutes : 0,
        title: habit.name,
      });
    }
  }

  return entries;
}

function plannedEventToEntry(
  event: PlannedEvent,
  {
    checkpointById,
    taskById,
  }: {
    checkpointById: Map<string, CheckpointRef>;
    taskById: Map<string, Task>;
  },
): DayPlanEntry | null {
  const startMinutes = timeToMinutes(event.startTime);
  const endMinutes = timeToMinutes(event.endTime);
  const hasTimeRange = startMinutes !== null && endMinutes !== null;
  const completed =
    event.sourceType === "task"
      ? Boolean(taskById.get(event.sourceId)?.completedAt)
      : Boolean(checkpointById.get(event.sourceId)?.checkpoint.completed);

  return {
    allDay: !hasTimeRange,
    completed,
    endMinutes: hasTimeRange
      ? normalizeEndMinutes(startMinutes, endMinutes)
      : MINUTES_IN_DAY,
    id: `planned-${event.id}`,
    kind: event.sourceType === "task" ? "task" : "goal",
    laneCount: 1,
    laneIndex: 0,
    sourceId: event.sourceId,
    startMinutes: hasTimeRange ? startMinutes : 0,
    title: event.title,
  };
}

function googleEventToEntry(
  event: GoogleCalendarDayEvent,
  dayStart: Date,
  dayEnd: Date,
): DayPlanEntry | null {
  if (event.allDay) {
    return {
      allDay: true,
      description: event.description,
      endMinutes: MINUTES_IN_DAY,
      id: `google-${event.id}`,
      kind: "google",
      laneCount: 1,
      laneIndex: 0,
      sourceId: event.id,
      startMinutes: 0,
      title: event.title,
    };
  }

  const start = event.start.dateTime ? new Date(event.start.dateTime) : null;
  const end = event.end.dateTime ? new Date(event.end.dateTime) : null;
  if (
    !start ||
    !end ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return null;
  }

  const startMinutes = clampMinutes(
    Math.floor((start.getTime() - dayStart.getTime()) / 60000),
  );
  const endMinutes = clampMinutes(
    Math.ceil((end.getTime() - dayStart.getTime()) / 60000),
  );

  if (
    end.getTime() <= dayStart.getTime() ||
    start.getTime() >= dayEnd.getTime()
  ) {
    return null;
  }

  return {
    allDay: false,
    description: event.description,
    endMinutes: normalizeEndMinutes(startMinutes, endMinutes),
    id: `google-${event.id}`,
    kind: "google",
    laneCount: 1,
    laneIndex: 0,
    sourceId: event.id,
    startMinutes,
    title: event.title,
  };
}

function buildHabitMap(snapshot: HabitLogsSnapshot | null) {
  const habitById = new Map<string, ActionHabit>();
  if (!snapshot) return habitById;

  for (const category of snapshot.categories) {
    for (const habit of category.habits) habitById.set(habit.id, habit);
  }

  for (const habit of snapshot.periodicHabits) {
    habitById.set(habit.id, habit);
  }

  return habitById;
}

function layoutTimedEntries(entries: DayPlanEntry[]): DayPlanEntry[] {
  const sorted = [...entries].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
  );
  const laidOut: DayPlanEntry[] = [];
  let cluster: DayPlanEntry[] = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) return;

    const laneEnds: number[] = [];
    const clusterEntries = cluster.map((entry) => {
      let laneIndex = laneEnds.findIndex((end) => end <= entry.startMinutes);
      if (laneIndex === -1) laneIndex = laneEnds.length;
      laneEnds[laneIndex] = entry.endMinutes;
      return { ...entry, laneIndex };
    });
    const laneCount = Math.max(laneEnds.length, 1);
    laidOut.push(
      ...clusterEntries.map((entry) => ({
        ...entry,
        laneCount,
      })),
    );
    cluster = [];
    clusterEnd = -1;
  };

  for (const entry of sorted) {
    if (cluster.length > 0 && entry.startMinutes >= clusterEnd) {
      flushCluster();
    }

    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.endMinutes);
  }

  flushCluster();
  return laidOut;
}

function getDayRange(date: Date) {
  const start = startOfDay(date);
  const end = addDays(start, 1);
  return {
    timeMax: end.toISOString(),
    timeMin: start.toISOString(),
  };
}

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hourText, minuteText = "0"] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return clampMinutes(hour * 60 + minute);
}

function normalizeEndMinutes(startMinutes: number, endMinutes: number) {
  if (endMinutes <= startMinutes) return MINUTES_IN_DAY;
  return Math.max(startMinutes + 15, endMinutes);
}

function clampMinutes(minutes: number) {
  return Math.max(0, Math.min(MINUTES_IN_DAY, minutes));
}

function minutesFromTimelineY(y: number) {
  return snapMinutes((Math.max(0, y) / HOUR_HEIGHT) * 60);
}

function normalizePlanRange(startMinutes: number, currentMinutes: number) {
  const snappedStart = snapMinutes(startMinutes);
  const snappedCurrent = snapMinutes(currentMinutes);
  let start = Math.min(snappedStart, snappedCurrent);
  let end = Math.max(snappedStart, snappedCurrent);

  if (end - start < MIN_PLAN_DURATION_MINUTES) {
    if (snappedCurrent < snappedStart) {
      start = Math.max(0, snappedStart - MIN_PLAN_DURATION_MINUTES);
      end = snappedStart;
    } else {
      start = Math.min(
        snappedStart,
        MINUTES_IN_DAY - MIN_PLAN_DURATION_MINUTES,
      );
      end = Math.min(MINUTES_IN_DAY, start + MIN_PLAN_DURATION_MINUTES);
    }
  }

  return { endMinutes: end, startMinutes: start };
}

function movePlanRange({
  durationMinutes,
  touchMinutes,
  touchOffsetMinutes,
}: {
  durationMinutes: number;
  touchMinutes: number;
  touchOffsetMinutes: number;
}) {
  const duration = Math.min(
    MINUTES_IN_DAY,
    Math.max(MIN_PLAN_DURATION_MINUTES, durationMinutes),
  );
  const start = clampNumber(
    snapMinutes(touchMinutes - touchOffsetMinutes),
    0,
    MINUTES_IN_DAY - duration,
  );

  return { endMinutes: start + duration, startMinutes: start };
}

function isTimelinePointOnEntry({
  entries,
  timelineWidth,
  x,
  y,
}: {
  entries: DayPlanEntry[];
  timelineWidth: number;
  x: number;
  y: number;
}) {
  return entries.some((entry) => {
    const top = (entry.startMinutes / 60) * HOUR_HEIGHT;
    const height = Math.max(
      ((entry.endMinutes - entry.startMinutes) / 60) * HOUR_HEIGHT,
      MIN_EVENT_HEIGHT,
    );

    if (y < top || y > top + height) return false;
    if (timelineWidth <= 0) return true;

    const laneWidth = 100 / Math.max(entry.laneCount, 1);
    const left = (laneWidth * entry.laneIndex * timelineWidth) / 100;
    const width = (laneWidth * timelineWidth) / 100;

    return x >= left && x <= left + width;
  });
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function googleEntryId(entryId: string) {
  return entryId.startsWith("google-")
    ? entryId.slice("google-".length)
    : entryId;
}

function snapMinutes(minutes: number) {
  return clampMinutes(
    Math.round(minutes / PLAN_SNAP_MINUTES) * PLAN_SNAP_MINUTES,
  );
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isFutureDate(date: Date) {
  return startOfDay(date).getTime() > startOfDay(new Date()).getTime();
}

function isTodayOrFutureDate(date: Date) {
  return startOfDay(date).getTime() >= startOfDay(new Date()).getTime();
}

function formatHour(hour: number) {
  return formatPlanMinutesDisplay(hour * 60);
}

function formatMinuteRange(startMinutes: number, endMinutes: number) {
  return `${formatPlanMinutesDisplay(startMinutes)} - ${formatPlanMinutesDisplay(
    endMinutes,
  )}`;
}

function formatMinuteRangeCompact(startMinutes: number, endMinutes: number) {
  return `${formatPlanMinutesDisplay(startMinutes)}-${formatPlanMinutesDisplay(
    endMinutes,
  )}`;
}

function formatMinutes(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatPlanApiTime(minutes: number) {
  return formatMinutes(Math.min(minutes, MINUTES_IN_DAY - 1));
}

function formatDisplayDate(dateKey: string) {
  const date = dateFromKey(dateKey);
  if (Number.isNaN(date.getTime())) return dateKey;

  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

function getGoogleCalendarStatusMessage(status: string) {
  switch (status) {
    case "not_connected":
      return "Connect Google Calendar before adding other events.";
    case "missing_scope":
      return "Reconnect Google Calendar with calendar event permissions.";
    case "not_configured":
    case "auth_unavailable":
      return "Google Calendar is not configured for this app.";
    default:
      return "The Google Calendar event could not be created.";
  }
}

function getPlanTargetMeta(targetType: PlanTargetType) {
  switch (targetType) {
    case "dailyHabit":
      return {
        emptyText: "No daily habits to plan.",
        icon: sym("repeat", "repeat"),
        label: "Daily habit",
      };
    case "goal":
      return {
        emptyText: "No open goal checkpoints to plan.",
        icon: sym("target", "track_changes"),
        label: "Goal",
      };
    case "monthlyHabit":
      return {
        emptyText: "No monthly habits to plan.",
        icon: sym("calendar", "calendar_month"),
        label: "Monthly habit",
      };
    case "task":
      return {
        emptyText: "No open tasks to plan.",
        icon: sym("checklist", "checklist"),
        label: "Task",
      };
  }
}

function withHexAlpha(color: string, alphaHex: string) {
  return color.startsWith("#") && color.length === 7
    ? `${color}${alphaHex}`
    : color;
}

function sym(ios: string, android: string): SymbolViewProps["name"] {
  return { ios, android, web: android } as SymbolViewProps["name"];
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  dateControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 10,
    elevation: 10,
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  todayButton: {
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingHorizontal: 12,
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
  dateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dayBadge: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  weekday: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  dayNumber: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "800",
  },
  dateTextBlock: { flex: 1, minWidth: 0, gap: 2 },
  dateTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
  },
  dateSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#F3B7B933",
    padding: 12,
  },
  errorText: {
    flex: 1,
    color: "#9D474D",
    fontSize: 13,
    fontWeight: "700",
  },
  retryText: { color: "#9D474D", fontSize: 13, fontWeight: "800" },
  centerState: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  allDaySection: {
    gap: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
  },
  allDayLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  allDayChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  allDayChip: {
    maxWidth: "100%",
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  allDayChipText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
  },
  timelineCard: {
    height: TIMELINE_VIEWPORT_HEIGHT,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
  },
  timelineScroller: { flex: 1 },
  timeline: {
    height: HOUR_HEIGHT * 24,
    position: "relative",
  },
  hourRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  hourLabel: {
    width: TIME_LABEL_WIDTH,
    paddingTop: 5,
    paddingRight: 9,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
  },
  hourLine: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  eventLayer: {
    position: "absolute",
    top: 0,
    right: 6,
    bottom: 0,
    left: TIME_LABEL_WIDTH,
  },
  nowIndicator: {
    position: "absolute",
    left: TIME_LABEL_WIDTH - 6,
    right: 6,
    height: 2,
    marginTop: -1,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },
  nowDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    marginLeft: -5,
    backgroundColor: "#EA4335",
  },
  nowLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#EA4335",
  },
  dragLayer: {
    position: "absolute",
    top: 0,
    right: 6,
    bottom: 0,
    left: TIME_LABEL_WIDTH,
  },
  eventOuter: {
    position: "absolute",
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  eventPressable: { flex: 1 },
  eventBlock: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  eventBlockCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
  },
  eventTitle: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
  },
  eventTitleCompact: {
    flex: 1,
    minWidth: 0,
  },
  eventTime: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    opacity: 0.8,
  },
  eventTimeCompact: {
    flexShrink: 0,
    marginTop: 0,
  },
  draftPlanBlock: {
    position: "absolute",
    right: 2,
    left: 2,
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 9,
  },
  draftPlanText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000055",
  },
  sheetBackdrop: {
    zIndex: 0,
  },
  actionSheet: {
    position: "relative",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 26,
    paddingTop: 34,
    paddingBottom: 22,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 1,
  },
  actionTitle: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "900",
  },
  actionSubtitle: {
    marginTop: 5,
    marginBottom: 23,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  eventActionSheet: {
    position: "relative",
    overflow: "hidden",
    maxHeight: "82%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 1,
  },
  eventActionHeader: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
  },
  eventActionTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  eventActionTitle: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "900",
  },
  eventActionSubtitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  eventActionCloseButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  eventActionContent: {
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 22,
  },
  eventActionRow: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    borderRadius: 18,
    paddingHorizontal: 20,
  },
  eventActionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "900",
  },
  eventActionGrid: {
    flexDirection: "row",
    gap: 12,
  },
  eventActionTile: {
    flex: 1,
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 18,
  },
  eventActionTileLabel: {
    textAlign: "center",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  sheetActionRow: {
    minHeight: 73,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    borderRadius: 18,
    paddingHorizontal: 10,
  },
  sheetActionLabel: { fontSize: 20, lineHeight: 25, fontWeight: "800" },
  planPickerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  planPickerBackButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    marginTop: 2,
  },
  planPickerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  planPickerCreateButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    marginTop: 1,
  },
  otherEventHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  otherEventForm: {
    gap: 12,
  },
  otherEventInput: {
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
  },
  otherEventSaveButton: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  otherEventSaveText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  planPickerList: {
    gap: 10,
  },
  planPickerScroll: {
    maxHeight: 390,
  },
  planPickerTypeRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  planPickerTypeIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  planPickerOptionRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  planPickerOptionText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  planPickerOptionTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
  },
  planPickerOptionSubtitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  planPickerEmpty: {
    paddingVertical: 24,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  onboardingOverlay: {
    position: "absolute",
    right: 18,
    bottom: 26,
    left: 18,
    zIndex: 20,
  },
  onboardingTooltip: {
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 14,
  },
  onboardingTooltipTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  onboardingTooltipBody: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  onboardingTooltipButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    marginTop: 5,
    paddingHorizontal: 16,
  },
  onboardingTooltipButtonText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
  },
  onboardingGlow: {
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#34BEE8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 16,
  },
  onboardingDisabled: {
    opacity: 0.28,
  },
  disabledButton: { opacity: 0.55 },
  pressed: { opacity: 0.65 },
});
