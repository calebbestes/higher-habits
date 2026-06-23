import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import { GoalActionsModal } from "@/components/daily-goals/goal-actions-modal";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { PlanReportHeaderMenu } from "@/components/plan-report-header-menu";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import { uploadGoalPhoto } from "@/lib/goal-photos-client";
import {
  type GoogleCalendarDayEvent,
  fetchGoogleCalendarEvents,
  getLocalTimeZone,
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
import type { HabitVisibility } from "@/lib/habits-client";
import {
  type PlannedEvent,
  deletePlannedEvent,
  fetchPlannedEvents,
  upsertPlannedEvent,
} from "@/lib/planned-events-client";
import {
  type Goal,
  type GoalCheckpoint,
  fetchPlanGoals,
  updatePlanGoalCheckpoint,
} from "@/lib/planning-goals-client";
import { type Task, fetchTasks, updateTask } from "@/lib/tasks-client";

type DayPlanEntry = {
  allDay: boolean;
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

const HOUR_HEIGHT = 48;
const TIME_LABEL_WIDTH = 64;
const MIN_EVENT_HEIGHT = 30;
const MINUTES_IN_DAY = 24 * 60;
const PLAN_SNAP_MINUTES = 15;
const MIN_PLAN_DURATION_MINUTES = 30;
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

export function DayPlanScreen({ initialDateKey }: { initialDateKey?: string }) {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const timelineScrollRef = useRef<ScrollView>(null);
  const dragStartMinutesRef = useRef<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(() =>
    initialDateKey ? dateFromKey(initialDateKey) : new Date(),
  );
  const [snapshot, setSnapshot] = useState<HabitLogsSnapshot | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [planGoals, setPlanGoals] = useState<Goal[]>([]);
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
  const [dragPlanRange, setDragPlanRange] = useState<PlanRange | null>(null);
  const [draftPlanRange, setDraftPlanRange] = useState<PlanRange | null>(null);
  const [selectedPlanTargetType, setSelectedPlanTargetType] =
    useState<PlanTargetType | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const monthKey = useMemo(() => getMonthKey(selectedDate), [selectedDate]);
  const dayRange = useMemo(() => getDayRange(selectedDate), [selectedDate]);
  const timeZone = useMemo(() => getLocalTimeZone(), []);

  const load = useCallback(
    async ({ refreshing = false } = {}) => {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const [
          nextSnapshot,
          nextTasks,
          nextPlanGoals,
          googleResponse,
          nextPlannedEvents,
        ] = await Promise.all([
          fetchHabitLogsSnapshot(monthKey),
          fetchTasks(dateKey),
          fetchPlanGoals(),
          fetchGoogleCalendarEvents({
            timeMax: dayRange.timeMax,
            timeMin: dayRange.timeMin,
            timeZone,
          }),
          fetchPlannedEvents({ dateKey }),
        ]);
        setSnapshot(nextSnapshot);
        setTasks(nextTasks);
        setPlanGoals(nextPlanGoals);
        setGoogleEvents(googleResponse.events);
        setPlannedEvents(nextPlannedEvents);
        setGoogleStatus(googleResponse.status);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load day plan.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [dateKey, dayRange.timeMax, dayRange.timeMin, monthKey, timeZone],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the timeline to 7:00 when changing dates
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      timelineScrollRef.current?.scrollTo({
        animated: false,
        y: TIMELINE_INITIAL_OFFSET,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [dateKey]);

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
        dateKey,
        googleEvents,
        habitById,
        plannedEvents,
        snapshot,
        selectedDate,
      }),
    [dateKey, googleEvents, habitById, plannedEvents, selectedDate, snapshot],
  );
  const timedEntries = useMemo(
    () => layoutTimedEntries(entries.filter((entry) => !entry.allDay)),
    [entries],
  );
  const allDayEntries = entries.filter((entry) => entry.allDay);
  const activeKey = activeHabit ? `${activeHabit.id}_${dateKey}` : null;
  const activePlannedTime = activeKey
    ? snapshot?.plannedTimesByHabitDate[activeKey]
    : undefined;
  const timelinePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const startMinutes = minutesFromTimelineY(
            event.nativeEvent.locationY,
          );
          dragStartMinutesRef.current = startMinutes;
          setDragPlanRange(normalizePlanRange(startMinutes, startMinutes + 60));
        },
        onPanResponderMove: (_event, gesture) => {
          const startMinutes = dragStartMinutesRef.current;
          if (startMinutes === null) return;

          const currentMinutes = startMinutes + (gesture.dy / HOUR_HEIGHT) * 60;
          setDragPlanRange(normalizePlanRange(startMinutes, currentMinutes));
        },
        onPanResponderRelease: (_event, gesture) => {
          const startMinutes = dragStartMinutesRef.current;
          dragStartMinutesRef.current = null;
          if (startMinutes === null) return;

          const currentMinutes =
            Math.abs(gesture.dy) < 4
              ? startMinutes + 60
              : startMinutes + (gesture.dy / HOUR_HEIGHT) * 60;
          const range = normalizePlanRange(startMinutes, currentMinutes);
          setDragPlanRange(null);
          setDraftPlanRange(range);
          setSelectedPlanTargetType(null);
        },
        onPanResponderTerminate: () => {
          dragStartMinutesRef.current = null;
          setDragPlanRange(null);
        },
        onStartShouldSetPanResponder: () => true,
      }),
    [],
  );

  const goToToday = () => setSelectedDate(startOfDay(new Date()));
  const moveDate = (days: number) =>
    setSelectedDate((current) => addDays(current, days));
  const openInternalEntry = (entry: DayPlanEntry) => {
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
      startTime?: string | null;
      timeZone?: string | null;
    },
  ) => {
    if (!activeHabit) return;

    const key = `${activeHabit.id}_${dateKey}`;
    setUpdatingKey(key);
    try {
      await setHabitLog(activeHabit.id, dateKey, status, options);
      await load();
    } catch (updateError) {
      Alert.alert(
        "Day Plan",
        updateError instanceof Error
          ? updateError.message
          : "Could not update this habit.",
      );
    } finally {
      setUpdatingKey(null);
    }
  };

  const setActiveVisibility = async (visibility: HabitVisibility) => {
    if (!activeHabit) return;

    const key = `${activeHabit.id}_${dateKey}`;
    setUpdatingKey(key);
    try {
      await setHabitLogVisibility(activeHabit.id, dateKey, visibility);
      await load();
    } catch (updateError) {
      Alert.alert(
        "Day Plan",
        updateError instanceof Error
          ? updateError.message
          : "Could not update visibility.",
      );
    } finally {
      setUpdatingKey(null);
    }
  };

  const saveNote = async (habitId: string, notes: string) => {
    await setHabitLogNote(habitId, dateKey, notes);
    await load();
  };

  const addPhoto = async (habitId: string, source: GoalPhotoSource) => {
    if (uploadingPhotoSource) return;

    setUploadingPhotoSource(source);
    try {
      const photo = await pickGoalPhoto(source);
      if (!photo) return;

      await uploadGoalPhoto(habitId, dateKey, photo);
      await load();
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
      } else if (activeEntry.kind === "goal") {
        const checkpoint = checkpointById.get(activeEntry.sourceId);
        if (!checkpoint) {
          Alert.alert("Day Plan", "Could not find that checkpoint.");
          return;
        }

        await updatePlanGoalCheckpoint(
          checkpoint.checkpoint.id,
          !checkpoint.checkpoint.completed,
        );
      }

      setActiveEntry(null);
      await load();
    } catch (completeError) {
      Alert.alert(
        "Could not update event",
        completeError instanceof Error
          ? completeError.message
          : "The event could not be updated.",
      );
    } finally {
      setUpdatingKey(null);
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
              setActiveEntry(null);
              await load();
            } catch (deleteError) {
              Alert.alert(
                "Could not delete event",
                deleteError instanceof Error
                  ? deleteError.message
                  : "The event could not be deleted.",
              );
            } finally {
              setUpdatingKey(null);
            }
          },
        },
      ],
    );
  };

  const openAttachmentForActiveEntry = () => {
    if (!activeEntry) return;

    Alert.alert(
      "Photos and notes for this event",
      "Habit photos and notes are ready today. Task and goal checkpoint photos and notes need a generic post model so they can show in Journal and Friends.",
    );
  };

  const closeDraftPlan = () => {
    setDraftPlanRange(null);
    setSelectedPlanTargetType(null);
    setIsCreatingPlan(false);
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
      } else {
        const habit = habitById.get(targetId);
        if (!habit) throw new Error("Could not find that habit.");

        await setHabitLog(habit.id, dateKey, "planned", {
          endTime,
          startTime,
          timeZone,
        });
      }

      closeDraftPlan();
      await load();
    } catch (planError) {
      Alert.alert(
        "Could not add plan",
        planError instanceof Error
          ? planError.message
          : "The plan could not be created.",
      );
    } finally {
      setIsCreatingPlan(false);
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
                onRefresh={() => void load({ refreshing: true })}
              />
            }
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
                  Calendar events in gray, planned items in color
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
                <Pressable onPress={() => void load()}>
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
                        {...timelinePanResponder.panHandlers}
                        style={styles.dragLayer}
                      />
                      <View style={styles.eventLayer} pointerEvents="box-none">
                        {dragPlanRange ? (
                          <DraftPlanBlock range={dragPlanRange} />
                        ) : null}
                        {timedEntries.map((entry) => (
                          <TimedEntryBlock
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
          statusLabel={getInternalEntryStatusLabel(
            activeEntry,
            taskById,
            checkpointById,
          )}
          onAddPhoto={openAttachmentForActiveEntry}
          onClose={() => setActiveEntry(null)}
          onDelete={() => void deleteActiveEntry()}
          onOpenNote={openAttachmentForActiveEntry}
          onTakePhoto={openAttachmentForActiveEntry}
          onToggleComplete={() => void completeActiveEntry()}
        />
        <PlanSelectionModal
          dailyHabitOptions={dailyHabitOptions}
          goalOptions={goalOptions}
          isSaving={isCreatingPlan}
          monthlyHabitOptions={monthlyHabitOptions}
          range={draftPlanRange}
          selectedType={selectedPlanTargetType}
          taskOptions={taskOptions}
          onClose={closeDraftPlan}
          onSelectOption={(targetType, targetId) =>
            void createPlanFromDrag(targetType, targetId)
          }
          onSelectType={setSelectedPlanTargetType}
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
      </View>
    </ComponentErrorBoundary>
  );
}

function InternalEventActionsModal({
  entry,
  isUpdating,
  onAddPhoto,
  onClose,
  onDelete,
  onOpenNote,
  onTakePhoto,
  onToggleComplete,
  statusLabel,
}: {
  entry: DayPlanEntry | null;
  isUpdating: boolean;
  onAddPhoto: () => void;
  onClose: () => void;
  onDelete: () => void;
  onOpenNote: () => void;
  onTakePhoto: () => void;
  onToggleComplete: () => void;
  statusLabel: string;
}) {
  const theme = useTheme();
  if (!entry) return null;

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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
            <Pressable
              disabled={isUpdating}
              onPress={onToggleComplete}
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
  isSaving,
  monthlyHabitOptions,
  onClose,
  onSelectOption,
  onSelectType,
  range,
  selectedType,
  taskOptions,
}: {
  dailyHabitOptions: PlanTargetOption[];
  goalOptions: PlanTargetOption[];
  isSaving: boolean;
  monthlyHabitOptions: PlanTargetOption[];
  onClose: () => void;
  onSelectOption: (targetType: PlanTargetType, targetId: string) => void;
  onSelectType: (targetType: PlanTargetType | null) => void;
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

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.actionSheet, { backgroundColor: theme.background }]}
        >
          <View style={styles.planPickerHeader}>
            {selectedType ? (
              <Pressable
                accessibilityLabel="Back to plan types"
                hitSlop={8}
                onPress={() => onSelectType(null)}
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
          </View>

          {selectedType ? (
            <ScrollView
              contentContainerStyle={styles.planPickerList}
              showsVerticalScrollIndicator={false}
              style={styles.planPickerScroll}
            >
              {selectedOptions.length > 0 ? (
                selectedOptions.map((option) => (
                  <Pressable
                    disabled={isSaving}
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
              {(["task", "monthlyHabit", "dailyHabit", "goal"] as const).map(
                (targetType) => {
                  const meta = getPlanTargetMeta(targetType);
                  const count = optionsByType[targetType].length;

                  return (
                    <Pressable
                      key={targetType}
                      onPress={() => onSelectType(targetType)}
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
                          {count} available
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
                },
              )}
            </View>
          )}
        </SafeAreaView>
      </View>
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
  onPress,
}: {
  entry: DayPlanEntry;
  onPress?: () => void;
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

  const content = (
    <View style={[styles.eventBlock, { backgroundColor }]}>
      <Text numberOfLines={2} style={[styles.eventTitle, { color }]}>
        {entry.title}
      </Text>
      <Text numberOfLines={1} style={[styles.eventTime, { color }]}>
        {formatMinuteRange(entry.startMinutes, entry.endMinutes)}
      </Text>
    </View>
  );

  return (
    <View
      pointerEvents={onPress ? "auto" : "none"}
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
      {onPress ? (
        <Pressable
          accessibilityLabel={`Open ${entry.title}`}
          accessibilityRole="button"
          onPress={onPress}
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

  if (entry.kind === "habit") {
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
  dateKey,
  googleEvents,
  habitById,
  plannedEvents,
  selectedDate,
  snapshot,
}: {
  dateKey: string;
  googleEvents: GoogleCalendarDayEvent[];
  habitById: Map<string, ActionHabit>;
  plannedEvents: PlannedEvent[];
  selectedDate: Date;
  snapshot: HabitLogsSnapshot | null;
}): DayPlanEntry[] {
  const dayStart = startOfDay(selectedDate);
  const dayEnd = addDays(dayStart, 1);
  const entries: DayPlanEntry[] = [];

  for (const event of googleEvents) {
    const entry = googleEventToEntry(event, dayStart, dayEnd);
    if (entry) entries.push(entry);
  }

  for (const event of plannedEvents) {
    const entry = plannedEventToEntry(event);
    if (entry) entries.push(entry);
  }

  if (snapshot) {
    for (const habit of habitById.values()) {
      const key = `${habit.id}_${dateKey}`;
      if (snapshot.logsByHabitDate[key] !== "planned") continue;

      const plannedTime = snapshot.plannedTimesByHabitDate[key];
      const startMinutes = timeToMinutes(plannedTime?.startTime);
      const endMinutes = timeToMinutes(plannedTime?.endTime);
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

function plannedEventToEntry(event: PlannedEvent): DayPlanEntry | null {
  const startMinutes = timeToMinutes(event.startTime);
  const endMinutes = timeToMinutes(event.endTime);
  const hasTimeRange = startMinutes !== null && endMinutes !== null;

  return {
    allDay: !hasTimeRange,
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
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatMinuteRange(startMinutes: number, endMinutes: number) {
  return `${formatMinutes(startMinutes)} - ${formatMinutes(endMinutes)}`;
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
  eventTitle: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
  },
  eventTime: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    opacity: 0.8,
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
  actionSheet: {
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
    overflow: "hidden",
    maxHeight: "82%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
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
  pressed: { opacity: 0.65 },
});
