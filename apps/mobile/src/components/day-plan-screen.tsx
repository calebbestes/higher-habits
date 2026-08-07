import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import * as Haptics from "expo-haptics";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  type GestureResponderEvent,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CelebrationOverlay,
  confettiSource,
} from "@/components/celebration-overlay";
import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import {
  GoalActionsModal,
  PlanTimeSelect,
} from "@/components/daily-goals/goal-actions-modal";
import { modalStyles } from "@/components/daily-goals/shared";
import { GoalLogVisibilityControl } from "@/components/goal-log-visibility-control";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { GoalFormModal } from "@/components/goals-screen";
import { HabitFormModal } from "@/components/habits-manager-screen";
import {
  PageHeaderTitle,
  PlanSectionHeaderTabs,
} from "@/components/section-header-tabs";
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
  fetchGoogleCalendarEvents,
  getLocalTimeZone,
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar-client";
import {
  type HabitInCategory,
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
  type HabitInput,
  type HabitVisibility,
  createHabit,
  createCategory as createHabitCategory,
  fetchCategories,
} from "@/lib/habits-client";
import { playSelectionHaptic, playSuccessHaptic } from "@/lib/haptics";
import {
  DEFAULT_PLAN_PERIOD,
  DEFAULT_PLAN_START_TIME,
  PLAN_PERIODS,
  type PlanPeriod,
  formatPlanMinutesDisplay,
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
  createPlanGoal,
  fetchPlanGoals,
  updatePlanGoalCheckpoint,
} from "@/lib/planning-goals-client";
import {
  cancelScheduleEventNotificationAsync,
  scheduleHabitReminderAsync,
  scheduleScheduleEventNotificationAsync,
} from "@/lib/push-notifications";
import {
  type Task,
  type TaskInput,
  createTask,
  fetchTasks,
  getTaskImportanceScore,
  updateTaskCompletion,
} from "@/lib/tasks-client";

type DayPlanEntry = {
  allDay: boolean;
  completed?: boolean;
  description?: string | null;
  endMinutes: number;
  habitId?: string;
  id: string;
  kind: "goal" | "google" | "habit" | "other" | "task";
  laneCount: number;
  laneIndex: number;
  laneSpan: number;
  nestedInEvent?: boolean;
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
type TimelineTouch = {
  locationY: number;
  pageY: number;
};
type PlanTargetType = "dailyHabit" | "goal" | "monthlyHabit" | "task";
type SuggestedPlanEntry = DayPlanEntry & {
  defaultDurationMinutes?: number;
};
type PlanTargetOption = {
  id: string;
  subtitle?: string;
  title: string;
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
      isOverTimeline: boolean;
      lastPageY: number;
      latestRange: PlanRange;
      type: "schedule";
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
const MIN_PLAN_DURATION_MINUTES = 15;
const DEFAULT_UNSCHEDULED_DROP_MINUTES = 30;
const LONG_PRESS_DELAY_MS = 500;
const EVENT_DRAG_DELAY_MS = 350;
const EVENT_SCROLL_CANCEL_DISTANCE = 8;
const DAY_SWIPE_MIN_DISTANCE = 70;
const DAY_CHANGE_ANIMATION_DISTANCE = 28;
const UNSCHEDULED_TAP_MOVE_THRESHOLD = 10;
const TIMELINE_AUTO_SCROLL_EDGE = 54;
const TIMELINE_AUTO_SCROLL_INTERVAL_MS = 50;
const TIMELINE_AUTO_SCROLL_MAX_STEP = 18;
const TIMELINE_START_HOUR = 7;
const TIMELINE_VISIBLE_HOURS = 12;
const TIMELINE_INITIAL_OFFSET = TIMELINE_START_HOUR * HOUR_HEIGHT;
const TIMELINE_DEFAULT_VIEWPORT_HEIGHT = TIMELINE_VISIBLE_HOURS * HOUR_HEIGHT;
const TIMELINE_VIEWPORT_BOTTOM_GAP = 18;
const NESTED_EVENT_LEFT_PERCENT = 10;
const NESTED_EVENT_WIDTH_PERCENT = 90;
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
  onDateChange,
}: {
  initialDateKey?: string;
  onDateChange?: (dateKey: string) => void;
}) {
  const theme = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const tabBarHeight = useTabBarHeight();
  const bottomScrollPadding = Math.max(58, tabBarHeight - 28);
  const { projects, reloadProjects, createProject } = useTaskProjects();
  const timelineScrollRef = useRef<ScrollView>(null);
  const timelineViewportRef = useRef<View>(null);
  const timelineScrollYRef = useRef(TIMELINE_INITIAL_OFFSET);
  const timelineViewportTopRef = useRef(0);
  const timelineDragLayerWidthRef = useRef(0);
  const timelineGestureRef = useRef<TimelineGesture | null>(null);
  const cancelTimelineGestureRef = useRef<() => void>(() => undefined);
  const timelineHapticKeyRef = useRef<string | null>(null);
  const timelinePinchRef = useRef<{
    distance: number;
    hourHeight: number;
  } | null>(null);
  const daySwipeRef = useRef<{
    pageX: number;
    pageY: number;
  } | null>(null);
  const suppressDaySwipeRef = useRef(false);
  const dateMotionValueRef = useRef(new Animated.Value(0));
  const dateMotionDirectionRef = useRef(1);
  const didMountDateMotionRef = useRef(false);
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
  const [dismissedSuggestionIdsByDate, setDismissedSuggestionIdsByDate] =
    useState<Record<string, string[]>>({});
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [activeHabit, setActiveHabit] = useState<ActionHabit | null>(null);
  const [activeEntry, setActiveEntry] = useState<DayPlanEntry | null>(null);
  const [noteHabit, setNoteHabit] = useState<ActionHabit | null>(null);
  const [noteCheckpoint, setNoteCheckpoint] =
    useState<CheckpointNoteTarget | null>(null);
  const [dragPlanRange, setDragPlanRange] = useState<PlanRange | null>(null);
  const [dragEntry, setDragEntry] = useState<DayPlanEntry | null>(null);
  const [floatingScheduleDrag, setFloatingScheduleDrag] = useState<{
    entry: DayPlanEntry;
    pageX: number;
    pageY: number;
  } | null>(null);
  const [draftPlanRange, setDraftPlanRange] = useState<PlanRange | null>(null);
  const [otherEventRange, setOtherEventRange] = useState<PlanRange | null>(
    null,
  );
  const [isTimelineDragging, setIsTimelineDragging] = useState(false);
  const [timelineHourHeight, setTimelineHourHeight] = useState(HOUR_HEIGHT);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const [selectedPlanTargetType, setSelectedPlanTargetType] =
    useState<PlanTargetType | null>(null);
  const [creatingTargetType, setCreatingTargetType] =
    useState<PlanTargetType | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isCreatingOtherEvent, setIsCreatingOtherEvent] = useState(false);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(() =>
    startOfMonth(initialDateKey ? dateFromKey(initialDateKey) : new Date()),
  );
  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const isViewingToday = useMemo(
    () => toDateKey(now) === dateKey,
    [now, dateKey],
  );
  const nowLineTop = useMemo(
    () => ((now.getHours() * 60 + now.getMinutes()) / 60) * timelineHourHeight,
    [now, timelineHourHeight],
  );
  const timelineViewportHeight = useMemo(() => {
    const availableHeight =
      screenHeight -
      stickyHeaderHeight -
      tabBarHeight -
      TIMELINE_VIEWPORT_BOTTOM_GAP;

    return Math.max(TIMELINE_DEFAULT_VIEWPORT_HEIGHT, availableHeight);
  }, [screenHeight, stickyHeaderHeight, tabBarHeight]);
  const timelineMinHourHeight = timelineViewportHeight / 16;
  const timelineMaxHourHeight = timelineViewportHeight / 5;
  const timelineScrollMax = Math.max(
    0,
    timelineHourHeight * 24 - timelineViewportHeight,
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
    async ({ force = false, quiet = false, refreshing = false } = {}) => {
      if (!isMountedRef.current) return;
      const targetDate = selectedDate;
      const targetDateKey = dateKey;
      const targetMonthKey = monthKey;
      loadSequenceRef.current += 1;
      const sequence = loadSequenceRef.current;

      if (refreshing) {
        setIsRefreshing(true);
      } else if (!quiet) {
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
            : "Could not load daily plan.",
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
      const initialOffset = clampNumber(
        TIMELINE_START_HOUR * timelineHourHeight,
        0,
        timelineScrollMax,
      );
      timelineScrollYRef.current = initialOffset;
      timelineScrollRef.current?.scrollTo({
        animated: false,
        y: initialOffset,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [dateKey]);

  useEffect(() => {
    const nextScrollY = clampNumber(
      timelineScrollYRef.current,
      0,
      timelineScrollMax,
    );
    if (nextScrollY === timelineScrollYRef.current) return;

    timelineScrollYRef.current = nextScrollY;
    timelineScrollRef.current?.scrollTo({
      animated: false,
      y: nextScrollY,
    });
  }, [timelineScrollMax]);

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
  const scheduledHabitCounts = useMemo(
    () => getScheduledHabitCounts(snapshot, dateKey, plannedEvents),
    [dateKey, plannedEvents, snapshot],
  );
  const scheduledTaskIds = useMemo(
    () =>
      new Set(
        plannedEvents
          .filter((event) => event.sourceType === "task")
          .map((event) => event.sourceId),
      ),
    [plannedEvents],
  );
  const scheduledCheckpointIds = useMemo(
    () =>
      new Set(
        plannedEvents
          .filter((event) => event.sourceType === "goal_checkpoint")
          .map((event) => event.sourceId),
      ),
    [plannedEvents],
  );
  const dailyHabitOptions = useMemo<PlanTargetOption[]>(
    () =>
      sortByCompletionTotal(
        snapshot?.categories.flatMap((category) =>
          category.habits
            .filter(
              (habit) =>
                habit.period === "daily" &&
                !habit.hidden &&
                habit.planOnCalendar &&
                (scheduledHabitCounts.get(habit.id) ?? 0) <
                  Math.max(habit.frequencyGoal ?? 1, 1),
            )
            .map((habit) => ({
              completions: countHabitCompletions(
                snapshot.logsByHabitDate,
                habit.id,
              ),
              option: {
                id: habit.id,
                subtitle: category.name,
                title: habit.name,
              },
            })),
        ) ?? [],
      ),
    [scheduledHabitCounts, snapshot],
  );
  const monthlyHabitOptions = useMemo<PlanTargetOption[]>(
    () =>
      sortByCompletionTotal(
        snapshot?.periodicHabits
          .filter(
            (habit) =>
              habit.period !== "daily" &&
              habit.planOnCalendar &&
              isPeriodicHabitScheduledForDate(habit, selectedDate) &&
              (scheduledHabitCounts.get(habit.id) ?? 0) < 1,
          )
          .map((habit) => ({
            completions: countHabitCompletions(
              snapshot.logsByHabitDate,
              habit.id,
            ),
            option: {
              id: habit.id,
              subtitle: habit.goalTitle ?? "Periodic habit",
              title: habit.name,
            },
          })) ?? [],
      ),
    [scheduledHabitCounts, selectedDate, snapshot],
  );
  const taskOptions = useMemo<PlanTargetOption[]>(
    () =>
      tasks
        .filter((task) => !task.completedAt && !scheduledTaskIds.has(task.id))
        .map((task) => ({
          id: task.id,
          subtitle: [task.timeRequired, task.importance]
            .filter(Boolean)
            .join(" · "),
          title: task.name,
        })),
    [scheduledTaskIds, tasks],
  );
  const goalOptions = useMemo<PlanTargetOption[]>(
    () =>
      planGoals.flatMap((goal) =>
        goal.checkpoints
          .filter(
            (checkpoint) =>
              !checkpoint.completed &&
              !scheduledCheckpointIds.has(checkpoint.id),
          )
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
    [planGoals, scheduledCheckpointIds],
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
  const allDayEntries = useMemo(
    () => entries.filter((entry) => entry.allDay),
    [entries],
  );
  const calendarAllDayEntries = useMemo(
    () => allDayEntries.filter((entry) => entry.kind === "google"),
    [allDayEntries],
  );
  const rawSuggestedPlanEntries = useMemo(
    () =>
      buildSuggestedPlanEntries({
        allDayEntries,
        dateKey,
        planGoals,
        scheduledCheckpointIds,
        scheduledHabitCounts,
        scheduledTaskIds,
        snapshot,
        tasks,
      }),
    [
      allDayEntries,
      dateKey,
      planGoals,
      scheduledCheckpointIds,
      scheduledHabitCounts,
      scheduledTaskIds,
      snapshot,
      tasks,
    ],
  );
  const suggestedPlanEntries = useMemo(() => {
    const dismissedIds = new Set(dismissedSuggestionIdsByDate[dateKey] ?? []);
    return rawSuggestedPlanEntries.filter(
      (entry) => !dismissedIds.has(entry.id),
    );
  }, [dateKey, dismissedSuggestionIdsByDate, rawSuggestedPlanEntries]);
  const dismissSuggestedEntry = useCallback(
    (entryId: string) => {
      playSelectionHaptic();
      setDismissedSuggestionIdsByDate((current) => {
        const currentIds = current[dateKey] ?? [];
        if (currentIds.includes(entryId)) return current;
        return { ...current, [dateKey]: [...currentIds, entryId] };
      });
    },
    [dateKey],
  );
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
  const activeHabitStatus = activeKey
    ? snapshot?.logsByHabitDate[activeKey]
    : undefined;
  const activeModalStatus =
    activeHabitStatus ??
    (activeHabit?.defaultComplete
      ? "complete"
      : activePlannedTime
        ? "planned"
        : undefined);
  const isPlanSheetOpen = Boolean(
    activeHabit ||
      activeEntry ||
      draftPlanRange ||
      otherEventRange ||
      creatingTargetType ||
      noteHabit ||
      noteCheckpoint,
  );
  const updateTimelineViewportTop = (pageY: number, timelineY: number) => {
    timelineViewportTopRef.current =
      pageY - timelineY + timelineScrollYRef.current;
  };
  const handleStickyHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setStickyHeaderHeight((currentHeight) =>
      Math.abs(currentHeight - nextHeight) > 0.5 ? nextHeight : currentHeight,
    );
  }, []);
  const measureTimelineViewport = useCallback(() => {
    timelineViewportRef.current?.measureInWindow((_x, y) => {
      timelineViewportTopRef.current = y;
    });
  }, []);
  const getTouchDistance = (event: GestureResponderEvent) => {
    const [first, second] = event.nativeEvent.touches;
    if (!first || !second) return null;
    return Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
  };
  const handleTimelineTouchStart = (event: GestureResponderEvent) => {
    const distance = getTouchDistance(event);
    timelinePinchRef.current = distance
      ? { distance, hourHeight: timelineHourHeight }
      : null;
  };
  const handleTimelineTouchMove = (event: GestureResponderEvent) => {
    const pinch = timelinePinchRef.current;
    const distance = getTouchDistance(event);
    if (!pinch || !distance) return;

    const centerMinutes =
      ((timelineScrollYRef.current + timelineViewportHeight / 2) /
        Math.max(timelineHourHeight, 1)) *
      60;
    const nextHourHeight = clampNumber(
      pinch.hourHeight * (distance / pinch.distance),
      timelineMinHourHeight,
      timelineMaxHourHeight,
    );
    const nextScrollY = clampNumber(
      (centerMinutes / 60) * nextHourHeight - timelineViewportHeight / 2,
      0,
      Math.max(0, nextHourHeight * 24 - timelineViewportHeight),
    );

    timelineScrollYRef.current = nextScrollY;
    setTimelineHourHeight(nextHourHeight);
    timelineScrollRef.current?.scrollTo({ animated: false, y: nextScrollY });
  };
  const handleTimelineTouchEnd = (event: GestureResponderEvent) => {
    if (event.nativeEvent.touches.length < 2) {
      timelinePinchRef.current = null;
    }
    if (event.nativeEvent.touches.length === 0 && timelineGestureRef.current) {
      finishTimelineGesture();
    }
  };
  const getTimelineViewportY = (pageY: number) =>
    pageY - timelineViewportTopRef.current;
  const isPageYOverTimeline = (pageY: number) => {
    const viewportY = getTimelineViewportY(pageY);
    return viewportY >= 0 && viewportY <= timelineViewportHeight;
  };
  const getTimelineMinutesFromPageY = (
    pageY: number,
    options?: { clampToViewport?: boolean },
  ) => {
    const viewportY = getTimelineViewportY(pageY);
    const timelineY = options?.clampToViewport
      ? clampNumber(viewportY, 0, timelineViewportHeight)
      : viewportY;

    return minutesFromTimelineY(
      timelineScrollYRef.current + timelineY,
      timelineHourHeight,
    );
  };
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

    if (gesture.type === "schedule" && !gesture.isOverTimeline) {
      const isOverTimeline = isPageYOverTimeline(pageY);
      timelineGestureRef.current = {
        ...gesture,
        isOverTimeline,
        lastPageY: pageY,
      };

      if (!isOverTimeline) {
        setDragPlanRange(null);
        stopTimelineAutoScroll();
        return;
      }
    }

    const nextGesture = timelineGestureRef.current ?? gesture;
    const currentMinutes = getTimelineMinutesFromPageY(pageY, {
      clampToViewport: nextGesture.type === "schedule",
    });
    const range =
      nextGesture.type === "create"
        ? normalizePlanRange(nextGesture.anchorMinutes, currentMinutes)
        : nextGesture.type === "schedule"
          ? movePlanRange({
              durationMinutes: nextGesture.durationMinutes,
              touchOffsetMinutes: 0,
              touchMinutes: currentMinutes,
            })
          : movePlanRange({
              durationMinutes: nextGesture.durationMinutes,
              touchOffsetMinutes: nextGesture.touchOffsetMinutes,
              touchMinutes: currentMinutes,
            });
    const justEnteredTimeline =
      gesture.type === "schedule" && !gesture.isOverTimeline;

    timelineGestureRef.current = {
      ...nextGesture,
      ...(nextGesture.type === "schedule"
        ? { isOverTimeline: true }
        : undefined),
      lastPageY: pageY,
      latestRange: range,
    };
    if (justEnteredTimeline) {
      playTimelineDragStartHaptic();
      playTimelineRangeHaptic(range, true);
    } else {
      playTimelineRangeHaptic(range);
    }
    setDragPlanRange(range);
  };
  const updateTimelineAutoScroll = (pageY: number) => {
    const viewportY = pageY - timelineViewportTopRef.current;
    const gesture = timelineGestureRef.current;
    if (gesture?.type === "schedule" && !gesture.isOverTimeline) {
      stopTimelineAutoScroll();
      return;
    }

    const topDistance = Math.max(0, TIMELINE_AUTO_SCROLL_EDGE - viewportY);
    const bottomDistance = Math.max(
      0,
      viewportY - (timelineViewportHeight - TIMELINE_AUTO_SCROLL_EDGE),
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
      if (current.type === "schedule" && !current.isOverTimeline) {
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
        activeViewportY - (timelineViewportHeight - TIMELINE_AUTO_SCROLL_EDGE),
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
        hourHeight: timelineHourHeight,
        timelineWidth: timelineDragLayerWidthRef.current,
        x: press.locationX,
        y: press.locationY,
      })
    ) {
      return;
    }

    const startMinutes = minutesFromTimelineY(
      press.locationY,
      timelineHourHeight,
      "floor",
    );
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
    const { pageX, pageY } = event.nativeEvent;
    const gesture = timelineGestureRef.current;
    if (!gesture) return;

    if (gesture.type === "schedule") {
      setFloatingScheduleDrag(
        isPageYOverTimeline(pageY)
          ? null
          : { entry: gesture.entry, pageX, pageY },
      );
    }
    updateTimelineGestureFromPageY(pageY);
    updateTimelineAutoScroll(pageY);
  };
  const patchHabitPlanTime = useCallback(
    (habitId: string, startTime: string, endTime: string) => {
      const key = `${habitId}_${dateKey}`;
      const patchSnapshot = (
        current: HabitLogsSnapshot | null,
      ): HabitLogsSnapshot | null =>
        current
          ? {
              ...current,
              logsByHabitDate: {
                ...current.logsByHabitDate,
                [key]: current.logsByHabitDate[key] ?? "planned",
              },
              plannedTimesByHabitDate: {
                ...current.plannedTimesByHabitDate,
                [key]: {
                  ...(current.plannedTimesByHabitDate[key] ?? {
                    repeatsDaily: false,
                  }),
                  endTime,
                  startTime,
                },
              },
            }
          : current;

      setSnapshot((current) => {
        const next = patchSnapshot(current);
        if (next) snapshotCacheRef.current.set(monthKey, next);
        return next;
      });
    },
    [dateKey, monthKey],
  );
  const patchPlannedEvent = useCallback(
    (nextEvent: PlannedEvent) => {
      const replaceEvent = (events: PlannedEvent[]) => {
        const nextEvents = events.filter((event) => event.id !== nextEvent.id);
        nextEvents.push(nextEvent);
        return nextEvents.sort((left, right) =>
          String(left.startTime ?? "").localeCompare(
            String(right.startTime ?? ""),
          ),
        );
      };

      setPlannedEvents((current) => {
        const next = replaceEvent(current);
        plannedEventsCacheRef.current.set(dateKey, next);
        return next;
      });
    },
    [dateKey],
  );
  const patchGoogleEvent = useCallback(
    (eventId: string, nextEvent: GoogleCalendarDayEvent) => {
      const replaceEvent = (events: GoogleCalendarDayEvent[]) =>
        events.map((event) => (event.id === eventId ? nextEvent : event));

      setGoogleEvents((current) => {
        const next = replaceEvent(current);
        const cached = googleEventsCacheRef.current.get(dateKey);
        if (cached) {
          googleEventsCacheRef.current.set(dateKey, {
            ...cached,
            events: replaceEvent(cached.events),
          });
        }
        return next;
      });
    },
    [dateKey],
  );
  const scheduleEntryNotification = useCallback(
    (entry: DayPlanEntry, startTime: string | null) => {
      const eventId = getScheduleNotificationEventId(entry, dateKey);
      if (!eventId) return;

      void scheduleScheduleEventNotificationAsync({
        dateKey,
        eventId,
        startTime,
        title: entry.title,
      }).catch(() => undefined);
    },
    [dateKey],
  );
  const cancelEntryNotification = useCallback(
    (entry: DayPlanEntry) => {
      const eventId = getScheduleNotificationEventId(entry, dateKey);
      if (!eventId) return;
      void cancelScheduleEventNotificationAsync(eventId).catch(() => undefined);
    },
    [dateKey],
  );
  const saveMovedEntry = async (entry: DayPlanEntry, range: PlanRange) => {
    const startTime = formatPlanApiTime(range.startMinutes);
    const endTime = formatPlanApiTime(range.endMinutes);
    let notificationEntry = entry;
    setUpdatingKey(entry.id);

    try {
      if (entry.kind === "habit" && entry.habitId) {
        if (entry.sourceId) {
          const response = await upsertPlannedEvent({
            dateKey,
            endTime,
            sourceId: entry.sourceId,
            sourceParentId: entry.habitId,
            sourceType: "habit_instance",
            startTime,
            timeZone,
            title: entry.title,
          });
          patchPlannedEvent(response.event);
          notificationEntry = {
            ...entry,
            sourceId: response.event.sourceId,
          };
        } else {
          const habit = habitById.get(entry.habitId);
          const instanceTarget =
            habit?.period === "daily"
              ? Math.max(habit.frequencyGoal ?? 1, 1)
              : 1;

          if (instanceTarget > 1) {
            const response = await upsertPlannedEvent({
              dateKey,
              endTime,
              sourceParentId: entry.habitId,
              sourceType: "habit_instance",
              startTime,
              timeZone,
              title: entry.title,
            });
            patchPlannedEvent(response.event);
            notificationEntry = {
              ...entry,
              id: `planned-${response.event.id}`,
              sourceId: response.event.sourceId,
            };
          } else {
            await setHabitLog(entry.habitId, dateKey, "planned", {
              endTime,
              startTime,
              timeZone,
            });
            patchHabitPlanTime(entry.habitId, startTime, endTime);
          }
        }
        scheduleEntryNotification(notificationEntry, startTime);
      } else if (
        entry.kind === "task" ||
        entry.kind === "goal" ||
        entry.kind === "other"
      ) {
        if (!entry.sourceId) throw new Error("Could not find that event.");

        const response = await upsertPlannedEvent({
          dateKey,
          endTime,
          sourceId: entry.sourceId,
          sourceType:
            entry.kind === "task"
              ? "task"
              : entry.kind === "other"
                ? "other_event"
                : "goal_checkpoint",
          startTime,
          timeZone,
          title: entry.title,
        });
        patchPlannedEvent(response.event);
        scheduleEntryNotification(entry, startTime);
      } else if (entry.kind === "google") {
        const eventId = entry.sourceId ?? googleEntryId(entry.id);
        const response = await updateGoogleCalendarEvent({
          dateKey,
          description: entry.description ?? null,
          endTime,
          eventId,
          startTime,
          timeZone,
          title: entry.title,
        });
        if (response.status !== "synced") {
          throw new Error(getGoogleCalendarStatusMessage(response.status));
        }
        if (response.event) patchGoogleEvent(eventId, response.event);
        scheduleEntryNotification(
          { ...entry, sourceId: response.event?.id ?? eventId },
          startTime,
        );
      }
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

    if (!gesture) {
      setDragPlanRange(null);
      setDragEntry(null);
      setFloatingScheduleDrag(null);
      return;
    }

    if (gesture.type === "create") {
      setDragPlanRange(null);
      setDragEntry(null);
      setFloatingScheduleDrag(null);
      setDraftPlanRange(gesture.latestRange);
      setSelectedPlanTargetType(null);
      return;
    }

    if (gesture.type === "schedule" && !gesture.isOverTimeline) {
      setDragPlanRange(null);
      setDragEntry(null);
      setFloatingScheduleDrag(null);
      return;
    }

    if (gesture.type === "schedule") {
      setFloatingScheduleDrag(null);
      setDragPlanRange(gesture.latestRange);
      setDragEntry(gesture.entry);
      void saveMovedEntry(gesture.entry, gesture.latestRange).finally(() => {
        if (!isMountedRef.current) return;
        setDragPlanRange(null);
        setDragEntry(null);
      });
      return;
    }

    setDragPlanRange(null);
    setDragEntry(null);
    setFloatingScheduleDrag(null);
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
    setDragEntry(null);
    setFloatingScheduleDrag(null);
  };
  cancelTimelineGestureRef.current = cancelTimelineGesture;

  useEffect(() => {
    if (!isPlanSheetOpen && !datePickerOpen) return;
    cancelTimelineGestureRef.current();
  }, [datePickerOpen, isPlanSheetOpen]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") cancelTimelineGestureRef.current();
    });

    return () => {
      subscription.remove();
      cancelTimelineGestureRef.current();
    };
  }, []);

  const beginMoveEntry = (entry: DayPlanEntry, touch: TimelineTouch) => {
    const { locationY, pageY } = touch;
    const entryTop = (entry.startMinutes / 60) * timelineHourHeight;
    const timelineY = entryTop + locationY;
    const touchOffsetMinutes = clampNumber(
      (locationY / timelineHourHeight) * 60,
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
    setDragEntry(entry);
    setIsTimelineDragging(true);
    playTimelineDragStartHaptic();
    playTimelineRangeHaptic(range, true);
    updateTimelineAutoScroll(pageY);
  };
  const beginScheduleEntry = (
    entry: SuggestedPlanEntry,
    pageX: number,
    pageY: number,
  ) => {
    const isOverTimeline = isPageYOverTimeline(pageY);
    const durationMinutes =
      entry.defaultDurationMinutes ??
      (entry.kind === "habit" && entry.habitId
        ? getLastPlannedDurationMinutes(snapshot, entry.habitId, dateKey)
        : DEFAULT_UNSCHEDULED_DROP_MINUTES);
    const touchMinutes = getTimelineMinutesFromPageY(pageY, {
      clampToViewport: true,
    });
    const range = movePlanRange({
      durationMinutes,
      touchOffsetMinutes: 0,
      touchMinutes,
    });
    const draggableEntry = {
      ...entry,
      allDay: false,
      endMinutes: range.endMinutes,
      startMinutes: range.startMinutes,
    };

    suppressEntryPressUntilRef.current = Date.now() + 700;
    timelineGestureRef.current = {
      durationMinutes,
      entry: draggableEntry,
      isOverTimeline,
      lastPageY: pageY,
      latestRange: range,
      type: "schedule",
    };
    setDraftPlanRange(null);
    setSelectedPlanTargetType(null);
    setDragPlanRange(isOverTimeline ? range : null);
    setDragEntry(draggableEntry);
    setFloatingScheduleDrag(
      isOverTimeline ? null : { entry: draggableEntry, pageX, pageY },
    );
    setIsTimelineDragging(true);
    if (isOverTimeline) {
      playTimelineDragStartHaptic();
      playTimelineRangeHaptic(range, true);
      updateTimelineAutoScroll(pageY);
    } else {
      stopTimelineAutoScroll();
    }
  };

  const moveDate = useCallback((days: number) => {
    dateMotionDirectionRef.current = days > 0 ? 1 : -1;
    setSelectedDate((current) => addDays(current, days));
  }, []);
  const openDatePicker = useCallback(() => {
    playSelectionHaptic();
    setDatePickerMonth(startOfMonth(selectedDate));
    setDatePickerOpen(true);
  }, [selectedDate]);
  const selectPickerDate = useCallback(
    (date: Date) => {
      playSelectionHaptic();
      const nextDate = startOfDay(date);
      dateMotionDirectionRef.current = nextDate > selectedDate ? 1 : -1;
      setSelectedDate(nextDate);
      setDatePickerOpen(false);
    },
    [selectedDate],
  );
  const cancelDaySwipe = useCallback(() => {
    daySwipeRef.current = null;
  }, []);
  const handleDaySwipeStart = useCallback(
    (event: GestureResponderEvent) => {
      if (
        suppressDaySwipeRef.current ||
        isPlanSheetOpen ||
        isTimelineDragging ||
        event.nativeEvent.touches.length !== 1
      ) {
        cancelDaySwipe();
        return;
      }

      const touch = event.nativeEvent.touches[0];
      daySwipeRef.current = { pageX: touch.pageX, pageY: touch.pageY };
    },
    [cancelDaySwipe, isPlanSheetOpen, isTimelineDragging],
  );
  const handleDaySwipeEnd = useCallback(
    (event: GestureResponderEvent) => {
      const start = daySwipeRef.current;
      cancelDaySwipe();
      if (!start || dragEntry || draftPlanRange || timelinePinchRef.current) {
        return;
      }

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
    [cancelDaySwipe, dragEntry, draftPlanRange, moveDate],
  );
  const blockDaySwipeFromUnscheduled = useCallback(() => {
    suppressDaySwipeRef.current = true;
    cancelDaySwipe();
  }, [cancelDaySwipe]);
  const unblockDaySwipeFromUnscheduled = useCallback(() => {
    suppressDaySwipeRef.current = false;
    cancelDaySwipe();
  }, [cancelDaySwipe]);
  const openInternalEntry = (entry: DayPlanEntry) => {
    if (Date.now() < suppressEntryPressUntilRef.current) return;

    if (entry.kind === "habit" && entry.habitId) {
      if (entry.sourceId) {
        setActiveEntry(entry);
        return;
      }

      setActiveHabit(habitById.get(entry.habitId) ?? null);
      return;
    }

    if (
      entry.kind === "task" ||
      entry.kind === "goal" ||
      entry.kind === "google" ||
      entry.kind === "other"
    ) {
      setActiveEntry(entry);
    }
  };

  const setActiveStatus = async (
    status: HabitLogStatus,
    options?: {
      endTime?: string | null;
      repeatPlan?: boolean;
      startTime?: string | null;
      timeZone?: string | null;
    },
  ) => {
    if (!activeHabit) return;

    const key = `${activeHabit.id}_${dateKey}`;
    const wasComplete = activeModalStatus === "complete";
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
      if (status === "complete" && !wasComplete) {
        setCelebrate(true);
      }
      if (status === "planned" && nextOptions?.startTime) {
        scheduleEntryNotification(
          {
            allDay: false,
            habitId: activeHabit.id,
            id: `habit-${activeHabit.id}`,
            kind: "habit",
            laneCount: 1,
            laneIndex: 0,
            laneSpan: 1,
            startMinutes: 0,
            endMinutes: MIN_PLAN_DURATION_MINUTES,
            title: activeHabit.name,
          },
          nextOptions.startTime,
        );
      } else if (status !== "planned") {
        void cancelScheduleEventNotificationAsync(
          `habit:${activeHabit.id}:${dateKey}`,
        ).catch(() => undefined);
      }
      invalidateCurrentCaches({ google: true, snapshot: true });
      if (!isMountedRef.current) return;
      await load({ quiet: true });
    } catch (updateError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Daily Plan",
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
      await load({ quiet: true });
    } catch (updateError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Daily Plan",
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
    await load({ quiet: true });
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
      await load({ quiet: true });
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
    await load({ quiet: true });
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
      await load({ quiet: true });
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
          Alert.alert("Daily Plan", "Could not find that task.");
          return;
        }
        const wasComplete = Boolean(task.completedAt);

        await updateTaskCompletion(task, task.completedAt ? null : dateKey);
        if (!wasComplete) {
          playSuccessHaptic();
          setCelebrate(true);
        }
        cancelEntryNotification(activeEntry);
        invalidateCurrentCaches({ tasks: true });
      } else if (activeEntry.kind === "goal") {
        const checkpoint = checkpointById.get(activeEntry.sourceId);
        if (!checkpoint) {
          Alert.alert("Daily Plan", "Could not find that checkpoint.");
          return;
        }
        const wasComplete = checkpoint.checkpoint.completed;

        await updatePlanGoalCheckpoint(checkpoint.checkpoint.id, {
          completed: !checkpoint.checkpoint.completed,
        });
        if (!wasComplete) {
          playSuccessHaptic();
          setCelebrate(true);
        }
        cancelEntryNotification(activeEntry);
        invalidateCurrentCaches({ planGoals: true });
      }

      if (!isMountedRef.current) return;
      setActiveEntry(null);
      await load({ quiet: true });
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
      `"${entry.title}" will be removed from your daily plan and calendar.`,
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
                sourceType: getPlannedEventSourceTypeForEntry(entry),
              });
              cancelEntryNotification(entry);
              invalidateCurrentCaches({ google: true, planned: true });
              if (!isMountedRef.current) return;
              setActiveEntry(null);
              await load({ quiet: true });
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

  const clearActiveEntryPlan = async () => {
    if (!activeEntry?.sourceId) return;

    const entry = activeEntry;
    const sourceId = activeEntry.sourceId;
    setUpdatingKey(entry.id);
    try {
      await deletePlannedEvent({
        sourceId,
        sourceType: getPlannedEventSourceTypeForEntry(entry),
      });
      cancelEntryNotification(entry);
      invalidateCurrentCaches({ google: true, planned: true });
      if (!isMountedRef.current) return;
      setActiveEntry(null);
      await load({ quiet: true });
    } catch (deleteError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not clear plan",
        deleteError instanceof Error
          ? deleteError.message
          : "The plan could not be cleared.",
      );
    } finally {
      if (isMountedRef.current) setUpdatingKey(null);
    }
  };

  const saveActiveEntryTimeRange = async (range: PlanRange) => {
    if (!activeEntry) return;
    const entry = activeEntry;
    await saveMovedEntry(entry, range);
    if (!isMountedRef.current) return;
    setActiveEntry({
      ...entry,
      endMinutes: range.endMinutes,
      startMinutes: range.startMinutes,
    });
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
      Alert.alert("Daily Plan", "Could not find that checkpoint.");
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
      Alert.alert("Daily Plan", "Could not find that checkpoint.");
      return;
    }

    setUploadingPhotoSource(source);
    try {
      const photo = await pickGoalPhoto(source);
      if (!photo) return;

      await uploadCheckpointPhoto(checkpoint.checkpoint.id, photo);
      invalidateCurrentCaches({ planGoals: true });
      if (!isMountedRef.current) return;
      await load({ quiet: true });
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
      await load({ quiet: true });
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
    await load({ quiet: true });
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
    await load({ quiet: true });
  };

  const saveOtherEvent = async (title: string) => {
    if (!otherEventRange || isCreatingOtherEvent) return;

    setIsCreatingOtherEvent(true);
    try {
      const response = await upsertPlannedEvent({
        dateKey,
        endTime: formatPlanApiTime(otherEventRange.endMinutes),
        sourceType: "other_event",
        startTime: formatPlanApiTime(otherEventRange.startMinutes),
        timeZone,
        title,
      });

      if (!isMountedRef.current) return;
      patchPlannedEvent(response.event);
      scheduleEntryNotification(
        {
          allDay: false,
          endMinutes: otherEventRange.endMinutes,
          id: `planned-${response.event.id}`,
          kind: "other",
          laneCount: 1,
          laneIndex: 0,
          laneSpan: 1,
          sourceId: response.event.sourceId,
          startMinutes: otherEventRange.startMinutes,
          title,
        },
        formatPlanApiTime(otherEventRange.startMinutes),
      );
      setOtherEventRange(null);
      invalidateCurrentCaches({ google: true, planned: true });
      await load({ quiet: true });
    } catch (eventError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not add event",
        eventError instanceof Error
          ? eventError.message
          : "The event could not be created.",
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
        scheduleEntryNotification(
          {
            allDay: false,
            endMinutes: draftPlanRange.endMinutes,
            id: `task-${task.id}`,
            kind: "task",
            laneCount: 1,
            laneIndex: 0,
            laneSpan: 1,
            sourceId: task.id,
            startMinutes: draftPlanRange.startMinutes,
            title: task.name,
          },
          startTime,
        );
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
        scheduleEntryNotification(
          {
            allDay: false,
            description: checkpoint.goal.title,
            endMinutes: draftPlanRange.endMinutes,
            id: `goal-${checkpoint.checkpoint.id}`,
            kind: "goal",
            laneCount: 1,
            laneIndex: 0,
            laneSpan: 1,
            sourceId: checkpoint.checkpoint.id,
            startMinutes: draftPlanRange.startMinutes,
            title: checkpoint.checkpoint.title,
          },
          startTime,
        );
        invalidateCurrentCaches({ google: true, planned: true });
      } else {
        const habit = habitById.get(targetId);
        if (!habit) throw new Error("Could not find that habit.");

        const instanceTarget =
          habit.period === "daily" ? Math.max(habit.frequencyGoal ?? 1, 1) : 1;
        let scheduledSourceId: string | undefined;
        if (instanceTarget > 1) {
          const response = await upsertPlannedEvent({
            dateKey,
            endTime,
            sourceParentId: habit.id,
            sourceType: "habit_instance",
            startTime,
            timeZone,
            title: habit.name,
          });
          scheduledSourceId = response.event.sourceId;
          patchPlannedEvent(response.event);
        } else {
          await setHabitLog(habit.id, dateKey, "planned", {
            endTime,
            startTime,
            timeZone,
          });
        }
        scheduleEntryNotification(
          {
            allDay: false,
            endMinutes: draftPlanRange.endMinutes,
            habitId: habit.id,
            id:
              instanceTarget > 1
                ? `planned-habit-instance-${scheduledSourceId ?? habit.id}`
                : `habit-${habit.id}`,
            kind: "habit",
            laneCount: 1,
            laneIndex: 0,
            laneSpan: 1,
            sourceId: scheduledSourceId,
            startMinutes: draftPlanRange.startMinutes,
            title: habit.name,
          },
          startTime,
        );
        invalidateCurrentCaches({
          google: true,
          planned: instanceTarget > 1,
          snapshot: instanceTarget <= 1,
        });
      }

      if (!isMountedRef.current) return;
      closeDraftPlan();
      await load({ quiet: true });
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
            canCancelContentTouches
            contentContainerStyle={[
              styles.content,
              { paddingBottom: bottomScrollPadding },
            ]}
            onMomentumScrollEnd={measureTimelineViewport}
            onScrollEndDrag={measureTimelineViewport}
            onTouchCancel={cancelDaySwipe}
            onTouchEnd={handleDaySwipeEnd}
            onTouchStart={handleDaySwipeStart}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                tintColor={theme.primary}
                onRefresh={() => void load({ force: true, refreshing: true })}
              />
            }
            scrollEnabled={!isTimelineDragging}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={[0]}
          >
            <View
              onLayout={handleStickyHeaderLayout}
              style={[
                styles.stickyHeader,
                {
                  backgroundColor: theme.background,
                  borderBottomColor: theme.tabBorder,
                },
              ]}
            >
              <View style={styles.header}>
                <View style={styles.headerTitle}>
                  <PageHeaderTitle title="Plan" />
                  <PlanSectionHeaderTabs currentView="day-plan" />
                </View>
                <Pressable
                  accessibilityLabel="Choose date"
                  accessibilityRole="button"
                  onPress={openDatePicker}
                  style={({ pressed }) => [
                    styles.headerDateButton,
                    pressed && styles.pressed,
                  ]}
                >
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
                  <View style={styles.headerDateTextBlock}>
                    <Text
                      numberOfLines={1}
                      style={[styles.dateTitle, { color: theme.text }]}
                    >
                      {MONTH_NAMES[selectedDate.getMonth()]}{" "}
                      {selectedDate.getFullYear()}
                    </Text>
                  </View>
                </Pressable>
              </View>

              {!isLoading &&
              (calendarAllDayEntries.length > 0 ||
                suggestedPlanEntries.length > 0) ? (
                <View style={styles.stickyScheduleSections}>
                  {calendarAllDayEntries.length > 0 ? (
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
                        {calendarAllDayEntries.map((entry) => (
                          <EntryChip entry={entry} key={entry.id} />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {suggestedPlanEntries.length > 0 ? (
                    <View style={styles.unscheduledSection}>
                      <ScrollView
                        horizontal
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        onMomentumScrollEnd={unblockDaySwipeFromUnscheduled}
                        onScrollBeginDrag={blockDaySwipeFromUnscheduled}
                        onScrollEndDrag={unblockDaySwipeFromUnscheduled}
                        onTouchCancel={unblockDaySwipeFromUnscheduled}
                        onTouchEnd={unblockDaySwipeFromUnscheduled}
                        onTouchStart={blockDaySwipeFromUnscheduled}
                        showsHorizontalScrollIndicator={false}
                      >
                        <View style={styles.unscheduledRail}>
                          {suggestedPlanEntries.map((entry) => (
                            <EntryChip
                              entry={entry}
                              key={entry.id}
                              onBeginSchedule={(pageX, pageY) =>
                                beginScheduleEntry(entry, pageX, pageY)
                              }
                              onMove={handleTimelinePressMove}
                              onPress={() => openInternalEntry(entry)}
                              onRelease={finishTimelineGesture}
                              onDismiss={() => dismissSuggestedEntry(entry.id)}
                            />
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <Animated.View style={[styles.dateMotion, dateMotionStyle]}>
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
                  <FloatingLogoLoader />
                </View>
              ) : (
                <>
                  <View
                    ref={timelineViewportRef}
                    style={[
                      styles.timelineCard,
                      styles.timelineCardWide,
                      {
                        height: timelineViewportHeight,
                      },
                    ]}
                  >
                    <ScrollView
                      ref={timelineScrollRef}
                      contentOffset={{
                        x: 0,
                        y: TIMELINE_START_HOUR * timelineHourHeight,
                      }}
                      nestedScrollEnabled
                      onLayout={measureTimelineViewport}
                      onScroll={(event) => {
                        timelineScrollYRef.current =
                          event.nativeEvent.contentOffset.y;
                      }}
                      onTouchCancel={handleTimelineTouchEnd}
                      onTouchEnd={handleTimelineTouchEnd}
                      onTouchMove={handleTimelineTouchMove}
                      onTouchStart={handleTimelineTouchStart}
                      scrollEnabled={!isTimelineDragging}
                      scrollEventThrottle={16}
                      showsVerticalScrollIndicator={false}
                      style={styles.timelineScroller}
                    >
                      <View
                        style={[
                          styles.timeline,
                          { height: timelineHourHeight * 24 },
                        ]}
                      >
                        {HOURS.map((hour) => (
                          <View
                            key={hour}
                            style={[
                              styles.hourRow,
                              { height: timelineHourHeight },
                            ]}
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
                        <View
                          style={styles.eventLayer}
                          pointerEvents="box-none"
                        >
                          {timedEntries
                            .filter((entry) => entry.id !== dragEntry?.id)
                            .map((entry) => (
                              <TimedEntryBlock
                                entry={entry}
                                key={entry.id}
                                onBeginMove={(touch) =>
                                  beginMoveEntry(entry, touch)
                                }
                                onPress={() => openInternalEntry(entry)}
                                onMove={handleTimelinePressMove}
                                onRelease={finishTimelineGesture}
                                hourHeight={timelineHourHeight}
                              />
                            ))}
                          {dragEntry && dragPlanRange ? (
                            <TimedEntryBlock
                              entry={{
                                ...dragEntry,
                                endMinutes: dragPlanRange.endMinutes,
                                startMinutes: dragPlanRange.startMinutes,
                              }}
                              hourHeight={timelineHourHeight}
                              variant={
                                timelineGestureRef.current?.type === "schedule"
                                  ? "unscheduled"
                                  : "dragging"
                              }
                            />
                          ) : dragPlanRange ? (
                            <DraftPlanBlock
                              hourHeight={timelineHourHeight}
                              range={dragPlanRange}
                            />
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
            </Animated.View>
          </ScrollView>
        </SafeAreaView>

        {floatingScheduleDrag ? (
          <FloatingScheduleChip
            entry={floatingScheduleDrag.entry}
            pageX={floatingScheduleDrag.pageX}
            pageY={floatingScheduleDrag.pageY}
            screenWidth={screenWidth}
          />
        ) : null}

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
          status={activeModalStatus}
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
              (updatingKey === activeEntry.id ||
                updatingKey === `${activeEntry.kind}-${activeEntry.sourceId}`),
          )}
          statusLabel={getInternalEntryStatusLabel(
            activeEntry,
            taskById,
            checkpointById,
          )}
          visibility={activeCheckpoint?.checkpoint.visibility ?? "only_me"}
          onAddPhoto={() => void addCheckpointPhotoForActiveEntry("library")}
          onClearPlan={() => void clearActiveEntryPlan()}
          onClose={() => setActiveEntry(null)}
          onDelete={() => void deleteActiveEntry()}
          onOpenNote={openAttachmentForActiveEntry}
          onSaveTimeRange={(range) => void saveActiveEntryTimeRange(range)}
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
          range={draftPlanRange}
          selectedType={selectedPlanTargetType}
          taskOptions={taskOptions}
          onClose={closeDraftPlan}
          onCreate={(targetType) => {
            setCreatingTargetType(targetType);
          }}
          onCreateOtherEvent={openOtherEventForm}
          onSelectOption={(targetType, targetId) =>
            void createPlanFromDrag(targetType, targetId)
          }
          onSelectType={setSelectedPlanTargetType}
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
          initialValues={undefined}
          isOpen={creatingTargetType === "goal"}
          onClose={() => setCreatingTargetType(null)}
          onSave={saveCreatedGoal}
          saveHint={undefined}
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
        <DayPlanDatePicker
          month={datePickerMonth}
          onChangeMonth={setDatePickerMonth}
          onClose={() => setDatePickerOpen(false)}
          onSelectDate={selectPickerDate}
          selectedDate={selectedDate}
          visible={datePickerOpen}
        />
        <CelebrationOverlay
          visible={celebrate}
          source={confettiSource}
          withLogo
          onDone={() => setCelebrate(false)}
        />
      </View>
    </ComponentErrorBoundary>
  );
}

function DayPlanDatePicker({
  month,
  onChangeMonth,
  onClose,
  onSelectDate,
  selectedDate,
  visible,
}: {
  month: Date;
  onChangeMonth: (month: Date) => void;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
  visible: boolean;
}) {
  const theme = useTheme();
  const pressLocksRef = useRef<Set<string>>(new Set());
  const todayKey = toDateKey(new Date());
  const selectedKey = toDateKey(selectedDate);
  const days = useMemo(() => getCalendarMonthDays(month), [month]);
  const weeks = useMemo(
    () =>
      Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
        days.slice(index * 7, index * 7 + 7),
      ),
    [days],
  );
  const runPressAction = (key: string, action: () => void) => {
    if (pressLocksRef.current.has(key)) return;

    pressLocksRef.current.add(key);
    action();
    setTimeout(() => {
      pressLocksRef.current.delete(key);
    }, 500);
  };

  if (!visible) return null;

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View style={styles.datePickerOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.datePickerCard,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          <View style={styles.datePickerHeader}>
            <Pressable
              accessibilityLabel="Previous month"
              hitSlop={8}
              onPress={() =>
                runPressAction("previous-month", () => {
                  playSelectionHaptic();
                  onChangeMonth(addMonths(month, -1));
                })
              }
              style={({ pressed }) => [
                styles.datePickerNavButton,
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
            <Text style={[styles.datePickerTitle, { color: theme.text }]}>
              {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
            </Text>
            <Pressable
              accessibilityLabel="Next month"
              hitSlop={8}
              onPress={() =>
                runPressAction("next-month", () => {
                  playSelectionHaptic();
                  onChangeMonth(addMonths(month, 1));
                })
              }
              style={({ pressed }) => [
                styles.datePickerNavButton,
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

          <View style={styles.datePickerWeekdays}>
            {WEEKDAY_NAMES.map((day) => (
              <Text
                key={day}
                style={[
                  styles.datePickerWeekday,
                  { color: theme.textSecondary },
                ]}
              >
                {day.slice(0, day === "Thu" ? 2 : 1)}
              </Text>
            ))}
          </View>

          <View style={styles.datePickerGrid}>
            {weeks.map((week) => (
              <View
                key={toDateKey(week[0] ?? month)}
                style={styles.datePickerWeek}
              >
                {week.map((day) => {
                  const dayKey = toDateKey(day);
                  const isSelected = dayKey === selectedKey;
                  const isToday = dayKey === todayKey;
                  const inMonth = day.getMonth() === month.getMonth();

                  return (
                    <Pressable
                      accessibilityLabel={`Choose ${MONTH_NAMES[day.getMonth()]} ${day.getDate()}`}
                      accessibilityRole="button"
                      key={dayKey}
                      onPress={() =>
                        runPressAction(`date-${dayKey}`, () =>
                          onSelectDate(day),
                        )
                      }
                      style={({ pressed }) => [
                        styles.datePickerDay,
                        {
                          backgroundColor: isSelected
                            ? theme.primary
                            : theme.backgroundElement,
                          borderColor: isToday
                            ? theme.primary
                            : theme.tabBorder,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.datePickerDayText,
                          {
                            color: isSelected
                              ? theme.primaryForeground
                              : inMonth
                                ? theme.text
                                : theme.textSecondary,
                            opacity: inMonth || isSelected ? 1 : 0.48,
                          },
                        ]}
                      >
                        {day.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InternalEventActionsModal({
  entry,
  isUpdating,
  onAddPhoto,
  onClearPlan,
  onClose,
  onDelete,
  onOpenNote,
  onSaveTimeRange,
  onSetVisibility,
  onTakePhoto,
  onToggleComplete,
  statusLabel,
  visibility,
}: {
  entry: DayPlanEntry | null;
  isUpdating: boolean;
  onAddPhoto: () => void;
  onClearPlan: () => void;
  onClose: () => void;
  onDelete: () => void;
  onOpenNote: () => void;
  onSaveTimeRange: (range: PlanRange) => void;
  onSetVisibility: (visibility: HabitVisibility) => void;
  onTakePhoto: () => void;
  onToggleComplete: () => void;
  statusLabel: string;
  visibility: HabitVisibility;
}) {
  const theme = useTheme();
  const pressLocksRef = useRef<Set<string>>(new Set());
  const [planStartTime, setPlanStartTime] = useState("");
  const [planEndTime, setPlanEndTime] = useState("");
  const [planStartPeriod, setPlanStartPeriod] =
    useState<PlanPeriod>(DEFAULT_PLAN_PERIOD);
  const [planEndPeriod, setPlanEndPeriod] =
    useState<PlanPeriod>(DEFAULT_PLAN_PERIOD);
  const isOtherEvent = entry?.kind === "other";
  const isHabitEvent = entry?.kind === "habit";
  const isGoogleEvent = entry?.kind === "google";
  const isEditablePlannedBlock =
    Boolean(entry?.sourceId) && (isOtherEvent || isHabitEvent || isGoogleEvent);
  const currentStartTime = formatPlanApiTime(entry?.startMinutes ?? 9 * 60);
  const currentEndTime = formatPlanApiTime(entry?.endMinutes ?? 10 * 60);
  const nextStartTime = normalizePlanTimeInput(planStartTime, planStartPeriod);
  const nextEndTime = normalizePlanTimeInput(planEndTime, planEndPeriod);
  const nextStartMinutes = timeToMinutes(nextStartTime);
  const nextEndMinutes = timeToMinutes(nextEndTime);
  const hasTimeRangeChanges =
    nextStartTime !== currentStartTime || nextEndTime !== currentEndTime;
  const canSaveTimeRange =
    nextStartMinutes !== null &&
    nextEndMinutes !== null &&
    normalizeEndMinutes(nextStartMinutes, nextEndMinutes) > nextStartMinutes;
  const runPressAction = (key: string, action: () => void) => {
    if (pressLocksRef.current.has(key)) return;

    pressLocksRef.current.add(key);
    action();
    setTimeout(() => {
      pressLocksRef.current.delete(key);
    }, 500);
  };

  useEffect(() => {
    if (!entry || !isEditablePlannedBlock) return;

    const start = getPlanTimeInput(currentStartTime);
    const end = getPlanTimeInput(currentEndTime);
    setPlanStartTime(start.time || DEFAULT_PLAN_START_TIME);
    setPlanStartPeriod(start.period);
    setPlanEndTime(end.time || DEFAULT_PLAN_START_TIME);
    setPlanEndPeriod(end.period);
  }, [currentEndTime, currentStartTime, entry, isEditablePlannedBlock]);

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
                {entry.kind === "task"
                  ? "Task"
                  : entry.kind === "goal"
                    ? "Goal checkpoint"
                    : isHabitEvent
                      ? "Daily habit"
                      : isGoogleEvent
                        ? "Calendar event"
                        : "Other event"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={() => runPressAction("close", onClose)}
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
            canCancelContentTouches
            contentContainerStyle={styles.eventActionContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            {isEditablePlannedBlock ? (
              <>
                <Pressable
                  disabled={
                    isUpdating ||
                    (hasTimeRangeChanges && !canSaveTimeRange) ||
                    (!hasTimeRangeChanges && isGoogleEvent)
                  }
                  onPress={() =>
                    runPressAction("save-or-clear", () => {
                      if (
                        hasTimeRangeChanges &&
                        nextStartMinutes !== null &&
                        nextEndMinutes !== null
                      ) {
                        onSaveTimeRange({
                          endMinutes: normalizeEndMinutes(
                            nextStartMinutes,
                            nextEndMinutes,
                          ),
                          startMinutes: nextStartMinutes,
                        });
                        return;
                      }

                      if (isGoogleEvent) return;
                      onClearPlan();
                    })
                  }
                  style={({ pressed }) => [
                    styles.eventActionRow,
                    { backgroundColor: theme.backgroundElement },
                    hasTimeRangeChanges &&
                      !canSaveTimeRange &&
                      modalStyles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {isUpdating ? (
                    <ActivityIndicator color={theme.primary} size="small" />
                  ) : (
                    <SymbolView
                      name={
                        hasTimeRangeChanges
                          ? sym("calendar.badge.plus", "event_available")
                          : sym("calendar.badge.minus", "event_busy")
                      }
                      size={26}
                      tintColor={
                        hasTimeRangeChanges
                          ? theme.primary
                          : theme.textSecondary
                      }
                    />
                  )}
                  <Text
                    style={[styles.eventActionLabel, { color: theme.text }]}
                  >
                    {hasTimeRangeChanges || isGoogleEvent
                      ? "Save plan"
                      : "Clear plan"}
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
                      <PlanTimeSelect
                        fallbackHour={9}
                        onChange={setPlanStartTime}
                        value={planStartTime}
                      />
                      <View style={modalStyles.planPeriodToggle}>
                        {PLAN_PERIODS.map((period) => {
                          const isSelected = planStartPeriod === period;

                          return (
                            <Pressable
                              key={period}
                              onPress={() =>
                                runPressAction(`start-period-${period}`, () =>
                                  setPlanStartPeriod(period),
                                )
                              }
                              style={[
                                modalStyles.planPeriodOption,
                                {
                                  backgroundColor: isSelected
                                    ? theme.primary
                                    : "transparent",
                                  borderColor: theme.tabBorder,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  modalStyles.planPeriodText,
                                  {
                                    color: isSelected
                                      ? theme.primaryForeground
                                      : theme.textSecondary,
                                  },
                                ]}
                              >
                                {period}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
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
                      <PlanTimeSelect
                        fallbackHour={10}
                        onChange={setPlanEndTime}
                        value={planEndTime}
                      />
                      <View style={modalStyles.planPeriodToggle}>
                        {PLAN_PERIODS.map((period) => {
                          const isSelected = planEndPeriod === period;

                          return (
                            <Pressable
                              key={period}
                              onPress={() =>
                                runPressAction(`end-period-${period}`, () =>
                                  setPlanEndPeriod(period),
                                )
                              }
                              style={[
                                modalStyles.planPeriodOption,
                                {
                                  backgroundColor: isSelected
                                    ? theme.primary
                                    : "transparent",
                                  borderColor: theme.tabBorder,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  modalStyles.planPeriodText,
                                  {
                                    color: isSelected
                                      ? theme.primaryForeground
                                      : theme.textSecondary,
                                  },
                                ]}
                              >
                                {period}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                </View>
              </>
            ) : null}
            {!isEditablePlannedBlock ? (
              <>
                <Pressable
                  disabled={isUpdating}
                  onPress={() =>
                    runPressAction("toggle-complete", onToggleComplete)
                  }
                  style={({ pressed }) => [
                    styles.eventActionRow,
                    { backgroundColor: theme.backgroundElement },
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
                  <Text
                    style={[styles.eventActionLabel, { color: theme.text }]}
                  >
                    {statusLabel}
                  </Text>
                </Pressable>

                <View style={styles.eventActionGrid}>
                  <Pressable
                    onPress={() => runPressAction("take-photo", onTakePhoto)}
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
                      style={[
                        styles.eventActionTileLabel,
                        { color: theme.text },
                      ]}
                    >
                      Take photo
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => runPressAction("add-photo", onAddPhoto)}
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
                      style={[
                        styles.eventActionTileLabel,
                        { color: theme.text },
                      ]}
                    >
                      Add photo
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => runPressAction("open-note", onOpenNote)}
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
                  <Text
                    style={[styles.eventActionLabel, { color: theme.text }]}
                  >
                    Add note
                  </Text>
                </Pressable>
              </>
            ) : null}

            {entry.kind === "goal" ? (
              <GoalLogVisibilityControl
                allowed={["only_me", "all_friends"]}
                disabled={isUpdating}
                value={visibility}
                onChange={onSetVisibility}
                label="Event visibility"
              />
            ) : null}

            {!isGoogleEvent ? (
              <Pressable
                disabled={isUpdating}
                onPress={() => runPressAction("delete", onDelete)}
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
            ) : null}
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
  onSelectOption,
  onSelectType,
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
  onSelectOption: (targetType: PlanTargetType, targetId: string) => void;
  onSelectType: (targetType: PlanTargetType | null) => void;
  range: PlanRange | null;
  selectedType: PlanTargetType | null;
  taskOptions: PlanTargetOption[];
}) {
  const theme = useTheme();
  const pressLocksRef = useRef<Set<string>>(new Set());
  if (!range) return null;

  const optionsByType: Record<PlanTargetType, PlanTargetOption[]> = {
    dailyHabit: dailyHabitOptions,
    goal: goalOptions,
    monthlyHabit: monthlyHabitOptions,
    task: taskOptions,
  };
  const selectedOptions = selectedType ? optionsByType[selectedType] : [];
  const selectedMeta = selectedType ? getPlanTargetMeta(selectedType) : null;
  const runPressAction = (key: string, action: () => void) => {
    if (pressLocksRef.current.has(key)) return;

    pressLocksRef.current.add(key);
    action();
    setTimeout(() => {
      pressLocksRef.current.delete(key);
    }, 500);
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={!hidden}
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable
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
                hitSlop={8}
                onPress={() => runPressAction("back", () => onSelectType(null))}
                style={({ pressed }) => [
                  styles.planPickerBackButton,
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
                onPress={() =>
                  runPressAction(`create-${selectedType}`, () =>
                    onCreate(selectedType),
                  )
                }
                style={({ pressed }) => [
                  styles.planPickerCreateButton,
                  { backgroundColor: theme.primary },
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

          {selectedType ? (
            <ScrollView
              canCancelContentTouches
              contentContainerStyle={styles.planPickerList}
              showsVerticalScrollIndicator={false}
              style={styles.planPickerScroll}
            >
              {selectedOptions.length > 0 ? (
                selectedOptions.map((option) => (
                  <Pressable
                    disabled={isSaving}
                    key={option.id}
                    onPress={() =>
                      runPressAction(
                        `option-${selectedType}-${option.id}`,
                        () => onSelectOption(selectedType, option.id),
                      )
                    }
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
                    key={targetType}
                    onPress={() =>
                      runPressAction(`type-${targetType}`, () =>
                        isOtherEvent
                          ? onCreateOtherEvent()
                          : onSelectType(targetType),
                      )
                    }
                    style={({ pressed }) => [
                      styles.planPickerTypeRow,
                      { backgroundColor: theme.backgroundElement },
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
  const submitLockRef = useRef(false);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (range) setTitle("");
  }, [range]);

  useEffect(() => {
    if (!isSaving) submitLockRef.current = false;
  }, [isSaving]);

  if (!range) return null;

  const trimmedTitle = title.trim();
  const submit = () => {
    if (!trimmedTitle || isSaving || submitLockRef.current) return;

    submitLockRef.current = true;
    onSave(trimmedTitle);
  };

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

          <ScrollView
            canCancelContentTouches
            contentContainerStyle={styles.otherEventForm}
            keyboardShouldPersistTaps="always"
            scrollEnabled={false}
          >
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
              onSubmitEditing={submit}
            />
            <Pressable
              disabled={!trimmedTitle || isSaving}
              onPress={submit}
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
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DraftPlanBlock({
  hourHeight,
  range,
}: {
  hourHeight: number;
  range: PlanRange;
}) {
  const theme = useTheme();
  const top = (range.startMinutes / 60) * hourHeight;
  const height = Math.max(
    ((range.endMinutes - range.startMinutes) / 60) * hourHeight,
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

function getSuggestedEntryTypeLabel(entry: DayPlanEntry) {
  if (entry.kind === "habit") return "Habit";
  if (entry.kind === "task") return "Task";
  if (entry.kind === "goal") return "Goal";
  return entry.description;
}

function FloatingScheduleChip({
  entry,
  pageX,
  pageY,
  screenWidth,
}: {
  entry: DayPlanEntry;
  pageX: number;
  pageY: number;
  screenWidth: number;
}) {
  const theme = useTheme();
  const width = Math.min(220, Math.max(140, screenWidth - 32));
  const left = clampNumber(pageX - width / 2, 16, screenWidth - width - 16);
  const top = Math.max(8, pageY - 26);
  const metaLabel = getSuggestedEntryTypeLabel(entry);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.floatingScheduleChip,
        styles.unscheduledHabitChip,
        {
          backgroundColor: theme.background,
          borderColor: theme.primary,
          left,
          top,
          width,
        },
      ]}
    >
      {metaLabel ? (
        <Text
          numberOfLines={1}
          style={[styles.allDayChipMeta, { color: theme.primary }]}
        >
          {metaLabel}
        </Text>
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.allDayChipText, { color: theme.text }]}
      >
        {entry.title}
      </Text>
    </View>
  );
}

function EntryChip({
  entry,
  onBeginSchedule,
  onDismiss,
  onMove,
  onPress,
  onRelease,
}: {
  entry: DayPlanEntry;
  onBeginSchedule?: (pageX: number, pageY: number) => void;
  onDismiss?: () => void;
  onMove?: (event: GestureResponderEvent) => void;
  onPress?: () => void;
  onRelease?: () => void;
}) {
  const theme = useTheme();
  const dragStartRef = useRef<{
    didStartDrag: boolean;
    didMove: boolean;
    pageX: number;
    pageY: number;
  } | null>(null);
  const dismissPressRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { backgroundColor, color } = getEntryColors(entry, theme);
  const isUnscheduledChip = Boolean(onBeginSchedule);
  const chipColor = isUnscheduledChip ? theme.text : color;
  const metaLabel = isUnscheduledChip
    ? getSuggestedEntryTypeLabel(entry)
    : entry.description;
  const clearLongPressTimer = () => {
    if (!longPressTimerRef.current) return;

    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };
  const startScheduleDrag = (pageX: number, pageY: number) => {
    if (!onBeginSchedule) return;

    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.didStartDrag) return;

    clearLongPressTimer();
    dragStart.didStartDrag = true;
    dragStart.didMove = true;
    onBeginSchedule(pageX, pageY);
  };
  const beginDismissPress = () => {
    dismissPressRef.current = true;
    clearLongPressTimer();
  };
  const finishDismissPress = () => {
    setTimeout(() => {
      dismissPressRef.current = false;
    }, 0);
  };

  const chip = (
    <View
      style={[
        styles.allDayChip,
        isUnscheduledChip && styles.allDayChipCompact,
        isUnscheduledChip
          ? [
              styles.unscheduledHabitChip,
              {
                backgroundColor: theme.background,
                borderColor: theme.primary,
              },
            ]
          : { backgroundColor },
      ]}
    >
      {metaLabel ? (
        <Text
          numberOfLines={1}
          style={[
            styles.allDayChipMeta,
            isUnscheduledChip && styles.allDayChipMetaCompact,
            { color: isUnscheduledChip ? theme.primary : color },
          ]}
        >
          {metaLabel}
        </Text>
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          styles.allDayChipText,
          isUnscheduledChip && styles.allDayChipTextCompact,
          onDismiss && styles.dismissibleChipText,
          { color: chipColor },
        ]}
      >
        {entry.title}
      </Text>
      {onDismiss ? (
        <Pressable
          accessibilityLabel={`Hide ${entry.title} for this day`}
          hitSlop={6}
          onPressIn={beginDismissPress}
          onPress={(event) => {
            event.stopPropagation();
            onDismiss();
            finishDismissPress();
          }}
          onPressOut={finishDismissPress}
          onTouchStart={beginDismissPress}
          onTouchEnd={finishDismissPress}
          onTouchCancel={finishDismissPress}
          onResponderTerminationRequest={() => false}
          onResponderTerminate={finishDismissPress}
          onStartShouldSetResponder={() => true}
          onResponderGrant={beginDismissPress}
          style={({ pressed }) => [
            styles.unscheduledDismissButton,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={sym("xmark", "close")}
            size={9}
            weight="bold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      ) : null}
    </View>
  );

  if (!(onPress || onBeginSchedule)) return chip;

  return (
    <View
      accessibilityLabel={`Open ${entry.title}`}
      accessibilityRole="button"
      onResponderGrant={(event) => {
        if (!onBeginSchedule) {
          dragStartRef.current = {
            didMove: false,
            didStartDrag: false,
            pageX: event.nativeEvent.pageX,
            pageY: event.nativeEvent.pageY,
          };
          return;
        }

        startScheduleDrag(event.nativeEvent.pageX, event.nativeEvent.pageY);
      }}
      onMoveShouldSetResponder={(event) => {
        if (!onBeginSchedule) return false;
        const dragStart = dragStartRef.current;
        if (!dragStart) return false;

        const dx = event.nativeEvent.pageX - dragStart.pageX;
        const dy = event.nativeEvent.pageY - dragStart.pageY;
        dragStart.didMove =
          Math.abs(dx) > UNSCHEDULED_TAP_MOVE_THRESHOLD ||
          Math.abs(dy) > UNSCHEDULED_TAP_MOVE_THRESHOLD;

        return Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.1;
      }}
      onResponderMove={(event) => {
        const dragStart = dragStartRef.current;
        if (!dragStart) return;

        if (dragStart.didStartDrag) {
          onMove?.(event);
          return;
        }

        const dx = event.nativeEvent.pageX - dragStart.pageX;
        const dy = event.nativeEvent.pageY - dragStart.pageY;
        dragStart.didMove =
          Math.abs(dx) > UNSCHEDULED_TAP_MOVE_THRESHOLD ||
          Math.abs(dy) > UNSCHEDULED_TAP_MOVE_THRESHOLD;
        if (dragStart.didMove) clearLongPressTimer();
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.1) {
          startScheduleDrag(event.nativeEvent.pageX, event.nativeEvent.pageY);
        }
      }}
      onResponderRelease={() => {
        clearLongPressTimer();
        if (dismissPressRef.current) return;
        const dragStart = dragStartRef.current;
        dragStartRef.current = null;

        if (dragStart?.didStartDrag) {
          onRelease?.();
          return;
        }

        if (!dragStart?.didMove) onPress?.();
      }}
      onResponderTerminate={() => {
        clearLongPressTimer();
        if (dismissPressRef.current) return;
        const didStartDrag = dragStartRef.current?.didStartDrag;
        dragStartRef.current = null;
        if (didStartDrag) onRelease?.();
      }}
      onResponderTerminationRequest={() => !dragStartRef.current?.didStartDrag}
      onStartShouldSetResponder={() => !onBeginSchedule}
      onTouchStart={(event) => {
        if (dismissPressRef.current) return;
        if (!onBeginSchedule) return;
        const { pageX, pageY } = event.nativeEvent;
        dragStartRef.current = {
          didMove: false,
          didStartDrag: false,
          pageX,
          pageY,
        };
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          startScheduleDrag(pageX, pageY);
        }, LONG_PRESS_DELAY_MS);
      }}
      onTouchMove={(event) => {
        if (dismissPressRef.current) return;
        if (!onBeginSchedule) return;
        const dragStart = dragStartRef.current;
        if (!dragStart) return;

        if (dragStart.didStartDrag) {
          onMove?.(event);
          return;
        }

        const touch = event.nativeEvent.touches[0];
        if (!touch) return;

        const dx = touch.pageX - dragStart.pageX;
        const dy = touch.pageY - dragStart.pageY;
        dragStart.didMove =
          Math.abs(dx) > UNSCHEDULED_TAP_MOVE_THRESHOLD ||
          Math.abs(dy) > UNSCHEDULED_TAP_MOVE_THRESHOLD;
        if (dragStart.didMove) clearLongPressTimer();
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.1) {
          startScheduleDrag(touch.pageX, touch.pageY);
        }
      }}
      onTouchEnd={() => {
        if (dismissPressRef.current) {
          clearLongPressTimer();
          dragStartRef.current = null;
          return;
        }
        if (!onBeginSchedule) return;
        clearLongPressTimer();
        const dragStart = dragStartRef.current;
        if (dragStart?.didStartDrag) {
          dragStartRef.current = null;
          onRelease?.();
          return;
        }

        dragStartRef.current = null;
        if (dragStart && !dragStart.didMove && !dragStart.didStartDrag) {
          onPress?.();
        }
      }}
      onTouchCancel={() => {
        if (dismissPressRef.current) {
          clearLongPressTimer();
          dragStartRef.current = null;
          return;
        }
        if (!onBeginSchedule) return;
        clearLongPressTimer();
        const didStartDrag = dragStartRef.current?.didStartDrag;
        dragStartRef.current = null;
        if (didStartDrag) onRelease?.();
      }}
    >
      {chip}
    </View>
  );
}

function TimedEntryBlock({
  entry,
  hourHeight,
  onBeginMove,
  onMove,
  onPress,
  onRelease,
  variant,
}: {
  entry: DayPlanEntry;
  hourHeight: number;
  onBeginMove?: (touch: TimelineTouch) => void;
  onMove?: (event: GestureResponderEvent) => void;
  onPress?: () => void;
  onRelease?: () => void;
  variant?: "dragging" | "unscheduled";
}) {
  const theme = useTheme();
  const dragStartRef = useRef<{
    didMove: boolean;
    didStartDrag: boolean;
    locationY: number;
    pageX: number;
    pageY: number;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { backgroundColor, color } = getEntryColors(entry, theme);
  const isUnscheduledPreview = variant === "unscheduled";
  const isDraggingPreview = variant === "dragging";
  const previewColor = isUnscheduledPreview ? theme.text : color;
  const eventBlockStyle = [
    styles.eventBlock,
    isDraggingPreview && styles.eventBlockDragging,
    isUnscheduledPreview
      ? [
          styles.unscheduledHabitChip,
          {
            backgroundColor: theme.background,
            borderColor: theme.primary,
          },
        ]
      : { backgroundColor },
  ];
  const top = (entry.startMinutes / 60) * hourHeight;
  const naturalHeight =
    ((entry.endMinutes - entry.startMinutes) / 60) * hourHeight;
  const height = Math.max(naturalHeight, MIN_EVENT_HEIGHT);
  const { left, width } = getEntryLayoutPercent(entry);
  const isTiny = naturalHeight < 24;
  const isCompact = height <= 38;
  const timeLabel = isCompact
    ? formatMinuteRangeCompact(entry.startMinutes, entry.endMinutes)
    : formatMinuteRange(entry.startMinutes, entry.endMinutes);
  const clearLongPressTimer = () => {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };
  useEffect(
    () => () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
    [],
  );
  const startMove = () => {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.didStartDrag) return;

    dragStart.didStartDrag = true;
    clearLongPressTimer();
    onBeginMove?.({
      locationY: dragStart.locationY,
      pageY: dragStart.pageY,
    });
  };
  const handleTouchStart = (event: GestureResponderEvent) => {
    const { locationY, pageX, pageY } = event.nativeEvent;
    dragStartRef.current = {
      didMove: false,
      didStartDrag: false,
      locationY,
      pageX,
      pageY,
    };
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(startMove, EVENT_DRAG_DELAY_MS);
  };
  const handleTouchMove = (event: GestureResponderEvent) => {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;

    if (!dragStart.didStartDrag) {
      const touch = event.nativeEvent.touches[0];
      const pageX = touch?.pageX ?? event.nativeEvent.pageX;
      const pageY = touch?.pageY ?? event.nativeEvent.pageY;
      const dx = pageX - dragStart.pageX;
      const dy = pageY - dragStart.pageY;

      if (Math.hypot(dx, dy) > EVENT_SCROLL_CANCEL_DISTANCE) {
        dragStart.didMove = true;
        clearLongPressTimer();
      }
      return;
    }

    onMove?.(event);
  };
  const handleTouchEnd = () => {
    const didStartDrag = dragStartRef.current?.didStartDrag ?? false;
    const didMove = dragStartRef.current?.didMove ?? false;
    clearLongPressTimer();
    dragStartRef.current = null;

    if (didStartDrag) {
      onRelease?.();
      return;
    }

    if (!didMove) onPress?.();
  };
  const handleTouchCancel = () => {
    const didStartDrag = dragStartRef.current?.didStartDrag ?? false;
    clearLongPressTimer();
    dragStartRef.current = null;
    if (didStartDrag) onRelease?.();
  };

  const content = isTiny ? (
    <View style={[eventBlockStyle, styles.eventBlockTiny]}>
      <Text
        numberOfLines={1}
        style={[
          styles.eventTitle,
          styles.eventTitleTiny,
          { color: previewColor },
        ]}
      >
        {entry.title}
      </Text>
    </View>
  ) : isCompact ? (
    <View style={[eventBlockStyle, styles.eventBlockCompact]}>
      <Text
        numberOfLines={1}
        style={[
          styles.eventTitle,
          styles.eventTitleCompact,
          { color: previewColor },
        ]}
      >
        {entry.title}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.eventTime,
          styles.eventTimeCompact,
          { color: previewColor },
        ]}
      >
        {timeLabel}
      </Text>
    </View>
  ) : (
    <View style={eventBlockStyle}>
      <Text
        numberOfLines={height >= 62 ? 2 : 1}
        style={[styles.eventTitle, { color: previewColor }]}
      >
        {entry.title}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.eventTime, { color: previewColor }]}
      >
        {timeLabel}
      </Text>
    </View>
  );

  return (
    <View
      pointerEvents={onPress || onBeginMove ? "auto" : "none"}
      style={[
        styles.eventOuter,
        {
          height,
          left: `${left}%`,
          top,
          width: `${width}%`,
        },
      ]}
    >
      {onPress || onBeginMove ? (
        <View
          accessibilityLabel={`Open ${entry.title}`}
          accessibilityRole="button"
          onTouchCancel={handleTouchCancel}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
          onTouchStart={handleTouchStart}
          style={styles.eventPressable}
        >
          {content}
        </View>
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
  if (entry.kind === "google" || entry.kind === "other") {
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
    const entry = plannedEventToEntry(event, {
      checkpointById,
      habitById,
      taskById,
    });
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
        description: habit.period === "monthly" ? "Periodic habit" : null,
        endMinutes: hasTimeRange
          ? normalizeEndMinutes(startMinutes, endMinutes)
          : MINUTES_IN_DAY,
        habitId: habit.id,
        id: `habit-${habit.id}`,
        kind: "habit",
        laneCount: 1,
        laneIndex: 0,
        laneSpan: 1,
        startMinutes: hasTimeRange ? startMinutes : 0,
        title: habit.name,
      });
    }

    for (const habit of snapshot.periodicHabits) {
      const key = `${habit.id}_${dateKey}`;
      const status = snapshot.logsByHabitDate[key];
      if (
        !habit.planOnCalendar ||
        !isPeriodicHabitScheduledForDate(habit, selectedDate)
      ) {
        continue;
      }
      if (status === "planned") continue;
      if (status === "complete" && snapshot.plannedTimesByHabitDate[key]) {
        continue;
      }

      entries.push({
        allDay: true,
        completed: status === "complete",
        description: "Periodic habit",
        endMinutes: MINUTES_IN_DAY,
        habitId: habit.id,
        id: `periodic-${habit.id}`,
        kind: "habit",
        laneCount: 1,
        laneIndex: 0,
        laneSpan: 1,
        startMinutes: 0,
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
      const dayLogStatus = snapshot.logsByHabitDate[`${habit.id}_${dateKey}`];
      if (dayLogStatus === "planned" || dayLogStatus === "complete") {
        continue;
      }

      const startMinutes = timeToMinutes(plan.startTime);
      const endMinutes = timeToMinutes(plan.endTime);
      const hasTimeRange = startMinutes !== null && endMinutes !== null;

      entries.push({
        allDay: !hasTimeRange,
        description: habit.period === "monthly" ? "Periodic habit" : null,
        endMinutes: hasTimeRange
          ? normalizeEndMinutes(startMinutes, endMinutes)
          : MINUTES_IN_DAY,
        habitId: habit.id,
        id: `habit-${habit.id}`,
        kind: "habit",
        laneCount: 1,
        laneIndex: 0,
        laneSpan: 1,
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
    habitById,
    taskById,
  }: {
    checkpointById: Map<string, CheckpointRef>;
    habitById: Map<string, ActionHabit>;
    taskById: Map<string, Task>;
  },
): DayPlanEntry | null {
  const startMinutes = timeToMinutes(event.startTime);
  const endMinutes = timeToMinutes(event.endTime);
  const hasTimeRange = startMinutes !== null && endMinutes !== null;
  const habitId =
    event.sourceType === "habit_instance"
      ? (event.sourceParentId ?? event.sourceId)
      : null;
  const completed =
    event.sourceType === "task"
      ? Boolean(taskById.get(event.sourceId)?.completedAt)
      : event.sourceType === "habit_instance"
        ? false
        : Boolean(checkpointById.get(event.sourceId)?.checkpoint.completed);
  const habit = habitId ? habitById.get(habitId) : null;

  return {
    allDay: !hasTimeRange,
    completed,
    description:
      event.sourceType === "habit_instance" ? "Daily habit" : undefined,
    endMinutes: hasTimeRange
      ? normalizeEndMinutes(startMinutes, endMinutes)
      : MINUTES_IN_DAY,
    id: `planned-${event.id}`,
    habitId: habitId ?? undefined,
    kind:
      event.sourceType === "task"
        ? "task"
        : event.sourceType === "other_event"
          ? "other"
          : event.sourceType === "habit_instance"
            ? "habit"
            : "goal",
    laneCount: 1,
    laneIndex: 0,
    laneSpan: 1,
    sourceId: event.sourceId,
    startMinutes: hasTimeRange ? startMinutes : 0,
    title: habit?.name ?? event.title,
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
      laneSpan: 1,
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
    laneSpan: 1,
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

function getScheduledHabitCounts(
  snapshot: HabitLogsSnapshot | null,
  dateKey: string,
  plannedEvents: PlannedEvent[],
) {
  const counts = new Map<string, number>();

  const addCount = (habitId: string, amount = 1) => {
    counts.set(habitId, (counts.get(habitId) ?? 0) + amount);
  };

  for (const event of plannedEvents) {
    if (event.sourceType !== "habit_instance") continue;
    const habitId = event.sourceParentId ?? event.sourceId;
    addCount(habitId);
  }

  if (!snapshot) return counts;

  for (const key of Object.keys(snapshot.logsByHabitDate)) {
    if (!key.endsWith(`_${dateKey}`)) continue;
    const status = snapshot.logsByHabitDate[key];
    if (status === "planned") {
      const plannedTime = snapshot.plannedTimesByHabitDate[key];
      const startMinutes = timeToMinutes(plannedTime?.startTime);
      const endMinutes = timeToMinutes(plannedTime?.endTime);
      if (startMinutes !== null && endMinutes !== null) {
        addCount(key.slice(0, -dateKey.length - 1));
      }
    } else if (status === "complete") {
      const habitId = key.slice(0, -dateKey.length - 1);
      addCount(
        habitId,
        Math.max(snapshot.completedCountsByHabitDate[key] ?? 1, 1),
      );
    }
  }

  for (const [habitId, plan] of Object.entries(
    snapshot.repeatingPlansByHabit,
  )) {
    if (dateKey < plan.originDate) continue;
    if (snapshot.explicitPlanDatesByHabit?.[habitId]?.includes(dateKey)) {
      continue;
    }
    if (snapshot.logsByHabitDate[`${habitId}_${dateKey}`] === "complete") {
      continue;
    }
    addCount(habitId);
  }

  return counts;
}

function countHabitCompletions(
  logsByHabitDate: HabitLogsSnapshot["logsByHabitDate"],
  habitId: string,
) {
  const prefix = `${habitId}_`;
  let total = 0;

  for (const [key, status] of Object.entries(logsByHabitDate)) {
    if (status === "complete" && key.startsWith(prefix)) total += 1;
  }

  return total;
}

function sortByCompletionTotal(
  rows: Array<{ completions: number; option: PlanTargetOption }>,
) {
  return rows
    .sort(
      (left, right) =>
        right.completions - left.completions ||
        left.option.title.localeCompare(right.option.title),
    )
    .map((row) => row.option);
}

function isExplicitDatePlannedEntry(
  entry: DayPlanEntry,
  snapshot: HabitLogsSnapshot | null,
  dateKey: string,
) {
  if (!snapshot || entry.kind !== "habit" || !entry.habitId) return false;
  const key = `${entry.habitId}_${dateKey}`;
  if (snapshot.logsByHabitDate[key] !== "planned") return false;
  const plannedTime = snapshot.plannedTimesByHabitDate[key];
  const startMinutes = timeToMinutes(plannedTime?.startTime);
  const endMinutes = timeToMinutes(plannedTime?.endTime);
  return startMinutes === null || endMinutes === null;
}

function buildSuggestedPlanEntries({
  allDayEntries,
  dateKey,
  planGoals,
  scheduledCheckpointIds,
  scheduledHabitCounts,
  scheduledTaskIds,
  snapshot,
  tasks,
}: {
  allDayEntries: DayPlanEntry[];
  dateKey: string;
  planGoals: Goal[];
  scheduledCheckpointIds: Set<string>;
  scheduledHabitCounts: Map<string, number>;
  scheduledTaskIds: Set<string>;
  snapshot: HabitLogsSnapshot | null;
  tasks: Task[];
}): SuggestedPlanEntry[] {
  const habitById = buildHabitMap(snapshot);
  const allDayHabitEntries = allDayEntries
    .filter(
      (entry) =>
        entry.kind === "habit" &&
        entry.habitId &&
        !entry.completed &&
        (scheduledHabitCounts.get(entry.habitId) ?? 0) <
          Math.max(habitById.get(entry.habitId)?.frequencyGoal ?? 1, 1),
    )
    .map((entry) => ({
      ...entry,
      defaultDurationMinutes:
        entry.habitId && snapshot
          ? getLastPlannedDurationMinutes(snapshot, entry.habitId, dateKey)
          : DEFAULT_UNSCHEDULED_DROP_MINUTES,
    }))
    .sort((left, right) => {
      const leftHabit = left.habitId ? habitById.get(left.habitId) : null;
      const rightHabit = right.habitId ? habitById.get(right.habitId) : null;
      return (
        getHabitPriorityScore(rightHabit?.priority) -
          getHabitPriorityScore(leftHabit?.priority) ||
        left.title.localeCompare(right.title)
      );
    });

  const periodicEntries = allDayHabitEntries
    .filter((entry) => {
      const habit = entry.habitId ? habitById.get(entry.habitId) : null;
      return habit?.period === "weekly" || habit?.period === "monthly";
    })
    .sort((left, right) => {
      const leftExplicit = isExplicitDatePlannedEntry(left, snapshot, dateKey);
      const rightExplicit = isExplicitDatePlannedEntry(
        right,
        snapshot,
        dateKey,
      );
      if (leftExplicit !== rightExplicit) return leftExplicit ? -1 : 1;
      return left.title.localeCompare(right.title);
    });

  const periodicHabitIds = new Set(
    periodicEntries.map((entry) => entry.habitId).filter(Boolean),
  );
  const recurringEntries = allDayHabitEntries.filter(
    (entry) => entry.habitId && !periodicHabitIds.has(entry.habitId),
  );
  const plannedAllDayHabitIds = new Set(
    allDayHabitEntries.map((entry) => entry.habitId).filter(Boolean),
  );

  const dailyHabitEntries =
    snapshot?.categories
      .flatMap((category) =>
        category.habits
          .filter(
            (habit) =>
              habit.period === "daily" &&
              habit.priority === "high" &&
              !habit.hidden &&
              habit.planOnCalendar &&
              !plannedAllDayHabitIds.has(habit.id) &&
              (scheduledHabitCounts.get(habit.id) ?? 0) <
                Math.max(habit.frequencyGoal ?? 1, 1),
          )
          .map((habit) => ({
            completions: countHabitCompletionsInLastDays(
              snapshot.logsByHabitDate,
              habit.id,
              dateKey,
              7,
            ),
            entry: suggestedEntry({
              description: category.name,
              habitId: habit.id,
              id: `suggested-habit-${habit.id}`,
              kind: "habit",
              title: habit.name,
            }),
          })),
      )
      .sort(
        (left, right) =>
          right.completions - left.completions ||
          left.entry.title.localeCompare(right.entry.title),
      )
      .map((row) => row.entry) ?? [];

  const taskEntries = tasks
    .filter((task) => !task.completedAt && !scheduledTaskIds.has(task.id))
    .sort((left, right) => {
      const leftDue = left.dueDate ?? "9999-99-99";
      const rightDue = right.dueDate ?? "9999-99-99";
      return (
        getTaskImportanceScore(right.importance) -
          getTaskImportanceScore(left.importance) ||
        leftDue.localeCompare(rightDue) ||
        left.name.localeCompare(right.name)
      );
    })
    .map((task) =>
      suggestedEntry({
        description: [
          task.dueDate ? formatDisplayDate(task.dueDate) : null,
          task.importance,
        ]
          .filter(Boolean)
          .join(" · "),
        id: `suggested-task-${task.id}`,
        kind: "task",
        sourceId: task.id,
        title: task.name,
      }),
    )
    .slice(0, 2);

  const checkpointEntries = planGoals
    .filter((goal) => goal.timing !== "later")
    .flatMap((goal) => {
      const checkpoint = [...goal.checkpoints]
        .sort(sortCheckpointsForPlanning)
        .find(
          (candidate) =>
            !candidate.completed && !scheduledCheckpointIds.has(candidate.id),
        );

      return checkpoint
        ? [
            {
              checkpoint,
              entry: suggestedEntry({
                description: goal.title,
                id: `suggested-goal-${checkpoint.id}`,
                kind: "goal",
                sourceId: checkpoint.id,
                title: checkpoint.title,
              }),
              goal,
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        getGoalTimingScore(right.goal.timing) -
          getGoalTimingScore(left.goal.timing) ||
        compareCheckpointDates(left.checkpoint, right.checkpoint, dateKey) ||
        left.goal.sortOrder - right.goal.sortOrder ||
        left.goal.title.localeCompare(right.goal.title) ||
        left.checkpoint.sortOrder - right.checkpoint.sortOrder ||
        left.checkpoint.title.localeCompare(right.checkpoint.title),
    )
    .map((row) => row.entry);

  return [
    ...periodicEntries,
    ...recurringEntries,
    ...dailyHabitEntries,
    ...taskEntries,
    ...checkpointEntries,
  ];
}

function getHabitPriorityScore(priority: ActionHabit["priority"] | undefined) {
  return priority === "high" ? 1 : 0;
}

function sortCheckpointsForPlanning(
  left: GoalCheckpoint,
  right: GoalCheckpoint,
) {
  return (
    compareOptionalDateKeys(left.targetDate, right.targetDate) ||
    left.sortOrder - right.sortOrder ||
    left.title.localeCompare(right.title)
  );
}

function compareCheckpointDates(
  left: GoalCheckpoint,
  right: GoalCheckpoint,
  dateKey: string,
) {
  const leftRank = getCheckpointDateRank(left.targetDate, dateKey);
  const rightRank = getCheckpointDateRank(right.targetDate, dateKey);

  return (
    leftRank - rightRank ||
    compareOptionalDateKeys(left.targetDate, right.targetDate)
  );
}

function getCheckpointDateRank(targetDate: string | null, dateKey: string) {
  if (!targetDate) return 2;
  return targetDate <= dateKey ? 0 : 1;
}

function compareOptionalDateKeys(left: string | null, right: string | null) {
  if (left && right) return left.localeCompare(right);
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function getGoalTimingScore(timing: Goal["timing"]) {
  return timing === "current" ? 1 : 0;
}

function countHabitCompletionsInLastDays(
  logsByHabitDate: HabitLogsSnapshot["logsByHabitDate"],
  habitId: string,
  dateKey: string,
  days: number,
) {
  const endDate = dateFromKey(dateKey);
  let total = 0;

  for (let offset = 0; offset < days; offset += 1) {
    const key = `${habitId}_${toDateKey(addDays(endDate, -offset))}`;
    if (logsByHabitDate[key] === "complete") total += 1;
  }

  return total;
}

function suggestedEntry({
  description,
  habitId,
  id,
  kind,
  sourceId,
  title,
}: {
  description?: string | null;
  habitId?: string;
  id: string;
  kind: DayPlanEntry["kind"];
  sourceId?: string;
  title: string;
}): SuggestedPlanEntry {
  return {
    allDay: true,
    description,
    endMinutes: MINUTES_IN_DAY,
    habitId,
    id,
    kind,
    laneCount: 1,
    laneIndex: 0,
    laneSpan: 1,
    sourceId,
    startMinutes: 0,
    title,
  };
}

function getScheduleNotificationEventId(entry: DayPlanEntry, dateKey: string) {
  if (entry.kind === "habit" && entry.sourceId) {
    return `habit-instance:${entry.sourceId}:${dateKey}`;
  }

  if (entry.kind === "habit" && entry.habitId) {
    return `habit:${entry.habitId}:${dateKey}`;
  }

  if (
    (entry.kind === "task" ||
      entry.kind === "goal" ||
      entry.kind === "other") &&
    entry.sourceId
  ) {
    return `${entry.kind}:${entry.sourceId}:${dateKey}`;
  }

  if (entry.kind === "google") {
    const eventId = entry.sourceId ?? googleEntryId(entry.id);
    return `google:${eventId}:${dateKey}`;
  }

  return null;
}

function getPlannedEventSourceTypeForEntry(entry: DayPlanEntry) {
  if (entry.kind === "task") return "task";
  if (entry.kind === "habit") return "habit_instance";
  if (entry.kind === "other") return "other_event";
  return "goal_checkpoint";
}

function getLastPlannedDurationMinutes(
  snapshot: HabitLogsSnapshot | null,
  habitId: string,
  dateKey: string,
) {
  if (!snapshot) return DEFAULT_UNSCHEDULED_DROP_MINUTES;

  const prefix = `${habitId}_`;
  const durations = Object.entries(snapshot.plannedTimesByHabitDate)
    .flatMap(([key, plan]) => {
      if (!key.startsWith(prefix)) return [];

      const startMinutes = timeToMinutes(plan.startTime);
      const endMinutes = timeToMinutes(plan.endTime);
      if (startMinutes === null || endMinutes === null) return [];

      return [
        {
          dateKey: key.slice(prefix.length),
          durationMinutes: Math.max(
            MIN_PLAN_DURATION_MINUTES,
            normalizeEndMinutes(startMinutes, endMinutes) - startMinutes,
          ),
        },
      ];
    })
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey));

  return (
    durations.find((duration) => duration.dateKey < dateKey)?.durationMinutes ??
    durations[0]?.durationMinutes ??
    DEFAULT_UNSCHEDULED_DROP_MINUTES
  );
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
      return { ...entry, laneIndex, laneSpan: 1 };
    });
    const laneCount = Math.max(laneEnds.length, 1);

    const entriesByLane = Array.from({ length: laneCount }, (_, laneIndex) =>
      clusterEntries.filter((entry) => entry.laneIndex === laneIndex),
    );

    laidOut.push(
      ...clusterEntries.map((entry) => ({
        ...entry,
        laneCount,
        laneSpan: getLaneSpan(entry, entriesByLane),
        nestedInEvent: clusterEntries.some(
          (container) =>
            container.id !== entry.id && isStrictlyInside(entry, container),
        ),
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

function getLaneSpan(
  entry: DayPlanEntry,
  entriesByLane: DayPlanEntry[][],
): number {
  let span = 1;

  for (
    let laneIndex = entry.laneIndex + 1;
    laneIndex < entriesByLane.length;
    laneIndex += 1
  ) {
    const blockers = entriesByLane[laneIndex].filter((candidate) =>
      entriesOverlap(entry, candidate),
    );
    if (
      blockers.length > 0 &&
      !blockers.every((candidate) => isStrictlyInside(candidate, entry))
    ) {
      break;
    }
    span += 1;
  }

  return span;
}

function entriesOverlap(left: DayPlanEntry, right: DayPlanEntry) {
  return (
    left.startMinutes < right.endMinutes && right.startMinutes < left.endMinutes
  );
}

function getEntryLayoutPercent(entry: DayPlanEntry) {
  if (entry.nestedInEvent) {
    return {
      left: NESTED_EVENT_LEFT_PERCENT,
      width: NESTED_EVENT_WIDTH_PERCENT,
    };
  }

  const laneWidth = 100 / Math.max(entry.laneCount, 1);
  return {
    left: laneWidth * entry.laneIndex,
    width: laneWidth * Math.max(entry.laneSpan, 1),
  };
}

function isStrictlyInside(candidate: DayPlanEntry, container: DayPlanEntry) {
  return (
    container.startMinutes < candidate.startMinutes &&
    candidate.endMinutes < container.endMinutes
  );
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

function minutesFromTimelineY(
  y: number,
  hourHeight: number,
  mode: "floor" | "round" = "round",
) {
  const minutes = (Math.max(0, y) / hourHeight) * 60;
  return mode === "floor" ? snapMinutesDown(minutes) : snapMinutes(minutes);
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
  hourHeight,
  timelineWidth,
  x,
  y,
}: {
  entries: DayPlanEntry[];
  hourHeight: number;
  timelineWidth: number;
  x: number;
  y: number;
}) {
  return entries.some((entry) => {
    const top = (entry.startMinutes / 60) * hourHeight;
    const height = Math.max(
      ((entry.endMinutes - entry.startMinutes) / 60) * hourHeight,
      MIN_EVENT_HEIGHT,
    );

    if (y < top || y > top + height) return false;
    if (timelineWidth <= 0) return true;

    const layout = getEntryLayoutPercent(entry);
    const left = (layout.left * timelineWidth) / 100;
    const width = (layout.width * timelineWidth) / 100;

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

function snapMinutesDown(minutes: number) {
  return clampMinutes(
    Math.floor(minutes / PLAN_SNAP_MINUTES) * PLAN_SNAP_MINUTES,
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

function startOfWeekDate(date: Date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function weeksBetween(referenceDate: Date, date: Date) {
  return Math.round(
    (startOfWeekDate(date).getTime() -
      startOfWeekDate(referenceDate).getTime()) /
      (7 * 24 * 60 * 60 * 1000),
  );
}

function weekOfMonth(date: Date) {
  const daysInMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  if (date.getDate() + 7 > daysInMonth) return 4;
  return Math.ceil(date.getDate() / 7) - 1;
}

function monthlyWeekdayCell(date: Date) {
  return weekOfMonth(date) * 7 + date.getDay();
}

function isPeriodicHabitScheduledForDate(
  habit: Pick<
    PeriodicHabitInfo,
    | "createdAt"
    | "period"
    | "repeatCadence"
    | "repeatDays"
    | "repeatInterval"
    | "repeatMonthlyType"
  >,
  date: Date,
) {
  if (habit.period === "daily") return true;

  const cadence = habit.repeatCadence ?? habit.period;
  const interval = habit.repeatInterval ?? 1;
  const dayOfWeek = date.getDay();

  if (cadence === "weekly") {
    const days = habit.repeatDays;
    if (!days?.length) return false;
    if (!days.includes(dayOfWeek)) return false;
    if (interval === 1) return true;
    return weeksBetween(new Date(habit.createdAt), date) % interval === 0;
  }

  if (cadence === "monthly") {
    const referenceDate = new Date(habit.createdAt);
    const monthDiff =
      (date.getFullYear() - referenceDate.getFullYear()) * 12 +
      (date.getMonth() - referenceDate.getMonth());
    if (monthDiff % interval !== 0) return false;

    const type = habit.repeatMonthlyType ?? "day_of_month";
    if (type === "day_of_month") {
      const days = habit.repeatDays?.filter((day) => day >= 1 && day <= 31);
      return days?.length
        ? days.includes(date.getDate())
        : date.getDate() === referenceDate.getDate();
    }

    const cells = habit.repeatDays?.filter((day) => day >= 0 && day <= 34);
    if (!cells?.length) {
      return monthlyWeekdayCell(date) === monthlyWeekdayCell(referenceDate);
    }
    if (cells.every((day) => day <= 6)) {
      return (
        cells.includes(dayOfWeek) &&
        weekOfMonth(date) === weekOfMonth(referenceDate)
      );
    }
    return cells.includes(monthlyWeekdayCell(date));
  }

  return false;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getCalendarMonthDays(month: Date) {
  const firstDay = startOfMonth(month);
  const firstGridDay = addDays(firstDay, -firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(firstGridDay, index));
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
        emptyText: "No periodic habits to plan.",
        icon: sym("calendar", "calendar_month"),
        label: "Periodic habit",
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
    paddingTop: 0,
  },
  stickyHeader: {
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 10,
    zIndex: 20,
    elevation: 20,
  },
  dateMotion: {
    gap: 10,
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
  headerDateButton: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 8,
    maxWidth: "52%",
    zIndex: 10,
    elevation: 10,
  },
  headerDateTextBlock: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: "flex-start",
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
    gap: 10,
  },
  dayBadge: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  weekday: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  dayNumber: {
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "800",
  },
  dateTextBlock: { flex: 1, minWidth: 0 },
  dateTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  datePickerOverlay: {
    flex: 1,
    justifyContent: "flex-start",
    backgroundColor: "#00000033",
    paddingHorizontal: 18,
    paddingTop: 118,
  },
  datePickerCard: {
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 16,
  },
  datePickerHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  datePickerTitle: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  datePickerNavButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  datePickerWeekdays: {
    flexDirection: "row",
    gap: 5,
    marginTop: 10,
  },
  datePickerWeekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  datePickerGrid: {
    gap: 5,
    marginTop: 7,
  },
  datePickerWeek: {
    flexDirection: "row",
    gap: 5,
  },
  datePickerDay: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
  },
  datePickerDayText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
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
  stickyScheduleSections: {
    gap: 8,
    paddingTop: 10,
  },
  allDaySection: {
    gap: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
  },
  unscheduledSection: {
    paddingVertical: 2,
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
  unscheduledRail: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 12,
  },
  floatingScheduleChip: {
    position: "absolute",
    zIndex: 100,
    elevation: 24,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 1,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  allDayChip: {
    maxWidth: "100%",
    position: "relative",
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 1,
  },
  allDayChipCompact: {
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  unscheduledHabitChip: {
    borderWidth: 1.5,
    borderStyle: "dotted",
  },
  allDayChipMeta: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  allDayChipMetaCompact: {
    fontSize: 8,
    lineHeight: 10,
  },
  allDayChipText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
  },
  allDayChipTextCompact: {
    fontSize: 12,
    lineHeight: 15,
  },
  dismissibleChipText: {
    paddingRight: 8,
  },
  unscheduledDismissButton: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  timelineCard: {
    overflow: "hidden",
  },
  timelineCardWide: {
    marginHorizontal: -10,
  },
  timelineScroller: { flex: 1 },
  timeline: {
    position: "relative",
  },
  hourRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  hourLabel: {
    width: TIME_LABEL_WIDTH,
    marginTop: -7,
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
  eventBlockDragging: {
    transform: [{ scale: 1.015 }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 8,
  },
  eventBlockCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
  },
  eventBlockTiny: {
    justifyContent: "center",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  eventTitle: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
  },
  eventTitleCompact: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 13,
  },
  eventTitleTiny: {
    fontSize: 10,
    lineHeight: 12,
  },
  eventTime: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    opacity: 0.8,
  },
  eventTimeCompact: {
    flexShrink: 1,
    maxWidth: "42%",
    marginTop: 0,
    fontSize: 9,
    lineHeight: 11,
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
  disabledButton: { opacity: 0.55 },
  pressed: { opacity: 0.65 },
});
