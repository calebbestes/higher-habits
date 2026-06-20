import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  fetchPlannedEvents,
} from "@/lib/planned-events-client";

type DayPlanEntry = {
  allDay: boolean;
  description?: string | null;
  endMinutes: number;
  habitId?: string;
  id: string;
  kind: "goal" | "google" | "habit" | "task";
  laneCount: number;
  laneIndex: number;
  startMinutes: number;
  title: string;
};

type ActionHabit = HabitInCategory | PeriodicHabitInfo;

const HOUR_HEIGHT = 48;
const TIME_LABEL_WIDTH = 64;
const MIN_EVENT_HEIGHT = 30;
const MINUTES_IN_DAY = 24 * 60;
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
  const [selectedDate, setSelectedDate] = useState(() =>
    initialDateKey ? dateFromKey(initialDateKey) : new Date(),
  );
  const [snapshot, setSnapshot] = useState<HabitLogsSnapshot | null>(null);
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
  const [noteHabit, setNoteHabit] = useState<ActionHabit | null>(null);
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
        const [nextSnapshot, googleResponse, nextPlannedEvents] =
          await Promise.all([
            fetchHabitLogsSnapshot(monthKey),
            fetchGoogleCalendarEvents({
              timeMax: dayRange.timeMax,
              timeMin: dayRange.timeMin,
              timeZone,
            }),
            fetchPlannedEvents({ dateKey }),
          ]);
        setSnapshot(nextSnapshot);
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

  const goToToday = () => setSelectedDate(startOfDay(new Date()));
  const moveDate = (days: number) =>
    setSelectedDate((current) => addDays(current, days));
  const openHabitEntry = (entry: DayPlanEntry) => {
    if (entry.kind !== "habit" || !entry.habitId) return;
    setActiveHabit(habitById.get(entry.habitId) ?? null);
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
              <PlanReportHeaderMenu currentView="day-plan" />
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
                  Calendar events in gray, planned habits in primary
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
                            entry.kind === "habit"
                              ? () => openHabitEntry(entry)
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
                      <View style={styles.eventLayer} pointerEvents="box-none">
                        {timedEntries.map((entry) => (
                          <TimedEntryBlock
                            entry={entry}
                            key={entry.id}
                            onPress={
                              entry.kind === "habit"
                                ? () => openHabitEntry(entry)
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
  dateControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  pressed: { opacity: 0.65 },
});
