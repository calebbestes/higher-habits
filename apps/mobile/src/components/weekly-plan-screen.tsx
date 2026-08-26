import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  type IconRecord,
  RichEditor,
  RichToolbar,
  actions,
} from "react-native-pell-rich-editor";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  PageHeaderTitle,
  PlanSectionHeaderTabs,
} from "@/components/section-header-tabs";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/google-auth-scopes";
import {
  type GoogleCalendarDayEvent,
  type GoogleCalendarEventsResponse,
  fetchGoogleCalendarEvents,
  fetchGoogleCalendarStatus,
  getLocalTimeZone,
} from "@/lib/google-calendar-client";
import {
  type HabitLogsSnapshot,
  fetchHabitLogsSnapshot,
  getMonthKey,
  toDateKey,
} from "@/lib/habit-logs-client";
import {
  getNativeAuthCallbackURLForPath,
  getNativeAuthErrorCallbackURLForPath,
} from "@/lib/native-auth-callback";
import { fetchWeekPlanBootstrap } from "@/lib/plan-bootstrap-client";
import type {
  PlannedEvent,
  PlannedEventSourceType,
} from "@/lib/planned-events-client";
import {
  type WeeklyPlanNoteHeader,
  fetchWeeklyPlanNote,
  fetchWeeklyPlanNoteHeaders,
  saveWeeklyPlanNote,
} from "@/lib/weekly-plan-notes-client";

type SymbolName = SymbolViewProps["name"];
type WeekEventSourceType = PlannedEventSourceType | "google";
type WeekEvent = Pick<
  PlannedEvent,
  "date" | "endTime" | "id" | "startTime" | "title"
> & {
  sourceType: WeekEventSourceType;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
const HOURS = Array.from({ length: 17 }, (_, index) => index + 6);
const HOUR_HEIGHT = 27;
const ALL_DAY_ROW_HEIGHT = 28;
const TIME_LABEL_WIDTH = 44;
const GRID_HEIGHT = HOURS.length * HOUR_HEIGHT;
const GRID_START_MINUTES = HOURS[0] * 60;
const GRID_END_MINUTES = (HOURS[HOURS.length - 1] + 1) * 60;
const EDITOR_ACTIONS = [
  actions.heading1,
  actions.setBold,
  actions.setItalic,
  actions.setStrikethrough,
  actions.insertBulletsList,
  actions.insertOrderedList,
  actions.checkboxList,
  actions.blockquote,
  actions.undo,
  actions.redo,
];

const HEADER_INSERT_PREVIEW_LIMIT = 4;

type LaidOutWeekEvent = {
  event: WeekEvent;
  laneCount: number;
  laneIndex: number;
};

type WeeklyPlanCacheEntry = {
  events: WeekEvent[];
  googleStatus?: GoogleCalendarEventsResponse["status"];
  headers: WeeklyPlanNoteHeader[];
  notes: string;
  updatedAt: number;
};

const WEEKLY_PLAN_CACHE_MAX_AGE_MS = 2 * 60 * 1000;
const weeklyPlanCache = new Map<string, WeeklyPlanCacheEntry>();

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function startOfWeek(date: Date): Date {
  const weekStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return weekStart;
}

function getWeeklyPlanCacheKey(
  weekStartKey: string,
  timeZone: string | null,
): string {
  return `${timeZone ?? "local"}:${weekStartKey}`;
}

function readWeeklyPlanCache(
  key: string,
  { allowStale = false }: { allowStale?: boolean } = {},
): WeeklyPlanCacheEntry | null {
  const entry = weeklyPlanCache.get(key);
  if (!entry) return null;
  if (
    !allowStale &&
    Date.now() - entry.updatedAt > WEEKLY_PLAN_CACHE_MAX_AGE_MS
  ) {
    return null;
  }
  return entry;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function formatCompactWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${MONTH_ABBRS[weekStart.getMonth()]} ${weekStart.getDate()}-${weekEnd.getDate()}`;
  }
  return `${MONTH_ABBRS[weekStart.getMonth()]} ${weekStart.getDate()}-${MONTH_ABBRS[weekEnd.getMonth()]} ${weekEnd.getDate()}`;
}

function formatHour(hour: number): string {
  if (hour === 12) return "12 PM";
  if (hour > 12) return `${hour - 12} PM`;
  return `${hour} AM`;
}

function formatEventTime(event: WeekEvent): string {
  if (!event.startTime) return "All day";
  const start = formatShortTime(event.startTime);
  if (!event.endTime) return start;
  return `${start}-${formatShortTime(event.endTime)}`;
}

function formatShortTime(value: string): string {
  const [hourPart, minutePart] = value.split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return minute
    ? `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`
    : `${displayHour} ${suffix}`;
}

function timeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour == null || minute == null) return null;
  return hour * 60 + minute;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDayRange(date: Date) {
  const start = startOfDay(date);
  const end = addDays(start, 1);
  return {
    timeMax: end.toISOString(),
    timeMin: start.toISOString(),
  };
}

function googleEventToWeekEvent(
  event: GoogleCalendarDayEvent,
  dateKey: string,
): WeekEvent {
  return {
    date: dateKey,
    endTime: event.allDay ? null : dateTimeToTime(event.end.dateTime),
    id: `google-${event.id}`,
    sourceType: "google",
    startTime: event.allDay ? null : dateTimeToTime(event.start.dateTime),
    title: event.title,
  };
}

function dedupeWeekEvents(events: WeekEvent[]): WeekEvent[] {
  const seen = new Set<string>();
  const deduped: WeekEvent[] = [];
  for (const event of events) {
    const key = `${event.id}-${event.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }
  return deduped;
}

function dateTimeToTime(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function getEventMinutes(event: WeekEvent) {
  const start = timeToMinutes(event.startTime) ?? GRID_START_MINUTES;
  const end = timeToMinutes(event.endTime) ?? start + 45;
  return {
    end: Math.min(Math.max(end, start + 30), GRID_END_MINUTES),
    start: Math.max(start, GRID_START_MINUTES),
  };
}

function layoutWeekDayEvents(events: WeekEvent[]): LaidOutWeekEvent[] {
  const timed = [...events].sort((left, right) => {
    const leftMinutes = getEventMinutes(left);
    const rightMinutes = getEventMinutes(right);
    return (
      leftMinutes.start - rightMinutes.start ||
      leftMinutes.end - rightMinutes.end ||
      left.title.localeCompare(right.title)
    );
  });
  const groups: WeekEvent[][] = [];
  let activeGroup: WeekEvent[] = [];
  let activeGroupEnd = -1;

  for (const event of timed) {
    const minutes = getEventMinutes(event);
    if (!activeGroup.length || minutes.start < activeGroupEnd) {
      activeGroup.push(event);
      activeGroupEnd = Math.max(activeGroupEnd, minutes.end);
    } else {
      groups.push(activeGroup);
      activeGroup = [event];
      activeGroupEnd = minutes.end;
    }
  }
  if (activeGroup.length) groups.push(activeGroup);

  return groups.flatMap((group) => {
    const laneEnds: number[] = [];
    const laidOut = group.map((event) => {
      const minutes = getEventMinutes(event);
      let laneIndex = laneEnds.findIndex((end) => end <= minutes.start);
      if (laneIndex < 0) laneIndex = laneEnds.length;
      laneEnds[laneIndex] = minutes.end;
      return { event, laneIndex };
    });
    const laneCount = Math.max(laneEnds.length, 1);
    return laidOut.map((item) => ({ ...item, laneCount }));
  });
}

function snapshotHabitEventsForWeek({
  snapshot,
  weekDateKeys,
}: {
  snapshot: HabitLogsSnapshot;
  weekDateKeys: string[];
}): WeekEvent[] {
  const habitNames = new Map<string, string>();
  for (const category of snapshot.categories) {
    for (const habit of category.habits) habitNames.set(habit.id, habit.name);
  }
  for (const habit of snapshot.periodicHabits) {
    habitNames.set(habit.id, habit.name);
  }

  const events: WeekEvent[] = [];
  const seen = new Set<string>();
  for (const dateKey of weekDateKeys) {
    for (const [key, plannedTime] of Object.entries(
      snapshot.plannedTimesByHabitDate,
    )) {
      if (!key.endsWith(`_${dateKey}`)) continue;
      const habitId = key.slice(0, -dateKey.length - 1);
      const title = habitNames.get(habitId);
      if (!title) continue;
      seen.add(`${habitId}_${dateKey}`);
      events.push({
        date: dateKey,
        endTime: plannedTime.endTime,
        id: `habit-snapshot-${habitId}-${dateKey}`,
        sourceType: "habit_instance",
        startTime: plannedTime.startTime,
        title,
      });
    }

    for (const [habitId, plan] of Object.entries(
      snapshot.repeatingPlansByHabit,
    )) {
      if (dateKey < plan.originDate) continue;
      if (snapshot.explicitPlanDatesByHabit?.[habitId]?.includes(dateKey)) {
        continue;
      }
      if (seen.has(`${habitId}_${dateKey}`)) continue;
      const title = habitNames.get(habitId);
      if (!title) continue;
      events.push({
        date: dateKey,
        endTime: plan.endTime,
        id: `habit-repeat-${habitId}-${dateKey}`,
        sourceType: "habit_instance",
        startTime: plan.startTime,
        title,
      });
    }
  }
  return events;
}

function normalizeEditorHtml(html: string): string {
  const visibleText = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8203;/g, "")
    .trim();

  return visibleText ? html.trim() : "";
}

function normalizeHeaderKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function extractHeadingTexts(html: string): string[] {
  const headings = new Map<string, string>();
  const matches = html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi);
  for (const match of matches) {
    const text = stripEditorText(match[1]).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = normalizeHeaderKey(text);
    if (!headings.has(key)) headings.set(key, text.slice(0, 160));
  }
  return [...headings.values()];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripEditorText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#8203;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function WeeklyPlanScreen({
  initialDateKey,
  onDateChange,
}: {
  initialDateKey?: string;
  onDateChange?: (dateKey: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const timeZone = useMemo(() => getLocalTimeZone(), []);
  const editorRef = useRef<RichEditor>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftNotesRef = useRef("");
  const savedNotesRef = useRef("");
  const initialSelectedDateKey =
    initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey)
      ? initialDateKey
      : toDateKey(new Date());
  const initialWeekStartKey = toDateKey(
    startOfWeek(dateFromKey(initialSelectedDateKey)),
  );
  const initialCachedWeek = readWeeklyPlanCache(
    getWeeklyPlanCacheKey(initialWeekStartKey, timeZone),
  );
  const [selectedDateKey, setSelectedDateKey] = useState(
    () => initialSelectedDateKey,
  );
  const [weekStartDate, setWeekStartDate] = useState(() =>
    startOfWeek(dateFromKey(selectedDateKey)),
  );
  const [weekEvents, setWeekEvents] = useState<WeekEvent[]>(
    () => initialCachedWeek?.events ?? [],
  );
  const [googleStatus, setGoogleStatus] = useState<
    GoogleCalendarEventsResponse["status"]
  >(() => initialCachedWeek?.googleStatus ?? "synced");
  const [savedHeaders, setSavedHeaders] = useState<WeeklyPlanNoteHeader[]>(
    () => initialCachedWeek?.headers ?? [],
  );
  const [notes, setNotes] = useState(() => initialCachedWeek?.notes ?? "");
  const [draftNotes, setDraftNotes] = useState(
    () => initialCachedWeek?.notes ?? "",
  );
  const [isLoading, setIsLoading] = useState(!initialCachedWeek);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isSyncingGoogleCalendar, setIsSyncingGoogleCalendar] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [headersModalOpen, setHeadersModalOpen] = useState(false);
  const [selectedHeaderIds, setSelectedHeaderIds] = useState<string[]>([]);
  const [editorFocused, setEditorFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const weekStartKey = useMemo(() => toDateKey(weekStartDate), [weekStartDate]);
  const weekDays = useMemo(() => getWeekDays(weekStartDate), [weekStartDate]);
  const weekEventsByDate = useMemo(() => {
    const map = new Map<string, WeekEvent[]>();
    for (const day of weekDays) map.set(toDateKey(day), []);
    for (const event of weekEvents) {
      const bucket = map.get(event.date);
      if (bucket) bucket.push(event);
    }
    for (const bucket of map.values()) bucket.sort(compareEvents);
    return map;
  }, [weekEvents, weekDays]);
  const selectedDayEvents = weekEventsByDate.get(selectedDateKey) ?? [];
  const hasUnsavedNotes = normalizeEditorHtml(draftNotes) !== notes;
  const notesPreview = useMemo(() => stripEditorText(draftNotes), [draftNotes]);
  const availableHeaders = useMemo(() => {
    const seen = new Set<string>();
    const merged: WeeklyPlanNoteHeader[] = [];
    for (const text of extractHeadingTexts(draftNotes)) {
      const key = normalizeHeaderKey(text);
      seen.add(key);
      merged.push({
        id: `draft:${key}`,
        text,
        updatedAt: new Date().toISOString(),
      });
    }
    for (const header of savedHeaders) {
      const key = normalizeHeaderKey(header.text);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(header);
    }
    return merged;
  }, [draftNotes, savedHeaders]);
  const editorStyle = useMemo(
    () => ({
      backgroundColor: theme.background,
      caretColor: theme.primary,
      color: theme.text,
      placeholderColor: theme.textSecondary,
      contentCSSText: `
        body {
          font-size: 19px;
          line-height: 1.5;
          padding: 18px 20px 28px;
        }
        p, ul, ol, blockquote { margin: 0 0 0.72em; }
        ul, ol { padding-left: 1.3em; }
        blockquote {
          border-left: 3px solid ${theme.tabBorder};
          color: ${theme.textSecondary};
          padding-left: 0.85em;
        }
      `,
    }),
    [
      theme.background,
      theme.primary,
      theme.tabBorder,
      theme.text,
      theme.textSecondary,
    ],
  );
  const toolbarIconMap = useMemo(
    () => ({
      [actions.heading1]: ({ tintColor }: IconRecord) => (
        <Text style={[styles.headingActionText, { color: tintColor }]}>H</Text>
      ),
    }),
    [],
  );

  useEffect(() => {
    draftNotesRef.current = draftNotes;
  }, [draftNotes]);

  useEffect(() => {
    savedNotesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    onDateChange?.(selectedDateKey);
  }, [onDateChange, selectedDateKey]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    },
    [],
  );

  const load = useCallback(
    async (refresh = false) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const cacheKey = getWeeklyPlanCacheKey(weekStartKey, timeZone);
      const freshCachedWeek = readWeeklyPlanCache(cacheKey);
      const cachedWeek =
        freshCachedWeek ?? readWeeklyPlanCache(cacheKey, { allowStale: true });

      if (!refresh && cachedWeek) {
        setWeekEvents(cachedWeek.events);
        setGoogleStatus(cachedWeek.googleStatus ?? "synced");
        setSavedHeaders(cachedWeek.headers);
        setNotes(cachedWeek.notes);
        setDraftNotes(cachedWeek.notes);
        setIsLoading(false);
        if (freshCachedWeek?.googleStatus) return;
      } else if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const weekDateKeys = weekDays.map((day) => toDateKey(day));
        const plannedResult = await Promise.allSettled([
          fetchWeekPlanBootstrap(
            weekDateKeys[0] ?? weekStartKey,
            weekDateKeys.at(-1) ?? weekStartKey,
          ),
        ]);
        const googleResults = await Promise.allSettled(
          weekDays.map((day) => {
            const range = getDayRange(day);
            return fetchGoogleCalendarEvents({
              timeMax: range.timeMax,
              timeMin: range.timeMin,
              timeZone,
            });
          }),
        );
        const monthKeys = [...new Set(weekDays.map((day) => getMonthKey(day)))];
        const snapshotResults = await Promise.allSettled(
          monthKeys.map((monthKey) => fetchHabitLogsSnapshot(monthKey)),
        );
        const [noteResult, headersResult] = await Promise.allSettled([
          fetchWeeklyPlanNote(weekStartKey),
          fetchWeeklyPlanNoteHeaders(),
        ]);

        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        const plannedWeekEvents =
          plannedResult[0]?.status === "fulfilled"
            ? plannedResult[0].value.plannedEvents
            : [];
        const googleWeekEvents = googleResults.flatMap((result, index) =>
          result.status === "fulfilled"
            ? result.value.events.map((event) =>
                googleEventToWeekEvent(event, weekDateKeys[index]),
              )
            : [],
        );
        const googleStatus =
          googleResults.find(
            (result) =>
              result.status === "fulfilled" && result.value.status === "synced",
          )?.status === "fulfilled"
            ? "synced"
            : (googleResults.find((result) => result.status === "fulfilled")
                ?.value.status ?? "error");
        const habitWeekEvents = snapshotResults.flatMap((result) =>
          result.status === "fulfilled"
            ? snapshotHabitEventsForWeek({
                snapshot: result.value,
                weekDateKeys,
              })
            : [],
        );
        const nextWeekEvents = dedupeWeekEvents([
          ...plannedWeekEvents,
          ...googleWeekEvents,
          ...habitWeekEvents,
        ]);
        const nextNotes =
          noteResult.status === "fulfilled"
            ? normalizeEditorHtml(noteResult.value.notes)
            : (cachedWeek?.notes ?? "");
        const nextHeaders =
          headersResult.status === "fulfilled"
            ? headersResult.value
            : (cachedWeek?.headers ?? []);

        setWeekEvents(nextWeekEvents);
        setGoogleStatus(googleStatus);
        setNotes(nextNotes);
        setDraftNotes(nextNotes);
        setSavedHeaders(nextHeaders);
        weeklyPlanCache.set(cacheKey, {
          events: nextWeekEvents,
          googleStatus,
          headers: nextHeaders,
          notes: nextNotes,
          updatedAt: Date.now(),
        });
      } catch (loadError) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load weekly plan.",
        );
      } finally {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [timeZone, weekDays, weekStartKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selectDate = useCallback((date: Date) => {
    setSelectedDateKey(toDateKey(date));
  }, []);

  const navigateWeek = useCallback((delta: -1 | 1) => {
    setWeekStartDate((current) => {
      const next = addDays(current, delta * 7);
      setSelectedDateKey(toDateKey(next));
      return next;
    });
  }, []);

  const goToToday = useCallback(() => {
    const today = new Date();
    setWeekStartDate(startOfWeek(today));
    setSelectedDateKey(toDateKey(today));
  }, []);

  const syncGoogleCalendar = useCallback(async () => {
    if (isSyncingGoogleCalendar) return;

    setIsSyncingGoogleCalendar(true);
    try {
      const status = await fetchGoogleCalendarStatus();
      if (!status.configured) {
        Alert.alert(
          "Google Calendar unavailable",
          "Google Calendar is not configured yet.",
        );
        return;
      }

      if (!status.connected) {
        const response = await authClient.linkSocial({
          provider: "google",
          callbackURL: getNativeAuthCallbackURLForPath("/plan-report"),
          errorCallbackURL:
            getNativeAuthErrorCallbackURLForPath("/plan-report"),
          scopes: GOOGLE_CALENDAR_SCOPES,
        });

        if (response.error) {
          throw new Error(
            response.error.message ?? "Could not connect Google Calendar.",
          );
        }
      }

      await load(true);
    } catch (syncError) {
      Alert.alert(
        "Google Calendar",
        syncError instanceof Error
          ? syncError.message
          : "Could not sync Google Calendar.",
      );
    } finally {
      if (mountedRef.current) setIsSyncingGoogleCalendar(false);
    }
  }, [isSyncingGoogleCalendar, load]);

  const saveNotes = useCallback(
    async (html?: string) => {
      const nextNotes = normalizeEditorHtml(html ?? draftNotesRef.current);
      if (nextNotes === savedNotesRef.current) return;
      setIsSavingNotes(true);
      setError(null);

      try {
        const saved = await saveWeeklyPlanNote({
          notes: nextNotes,
          weekStartDate: weekStartKey,
        });
        if (!mountedRef.current) return;
        const savedHtml = normalizeEditorHtml(saved.notes);
        setNotes(savedHtml);
        fetchWeeklyPlanNoteHeaders()
          .then((headers) => {
            if (!mountedRef.current) return;
            setSavedHeaders(headers);
            const cacheKey = getWeeklyPlanCacheKey(weekStartKey, timeZone);
            const cachedWeek = readWeeklyPlanCache(cacheKey, {
              allowStale: true,
            });
            weeklyPlanCache.set(cacheKey, {
              events: cachedWeek?.events ?? weekEvents,
              googleStatus: cachedWeek?.googleStatus ?? googleStatus,
              headers,
              notes: savedHtml,
              updatedAt: Date.now(),
            });
          })
          .catch(() => undefined);
      } catch (saveError) {
        if (!mountedRef.current) return;
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Could not save weekly notes.",
        );
      } finally {
        if (mountedRef.current) setIsSavingNotes(false);
      }
    },
    [googleStatus, timeZone, weekEvents, weekStartKey],
  );

  useEffect(() => {
    if (!notesModalOpen || !hasUnsavedNotes || isLoading) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void saveNotes(draftNotesRef.current);
    }, 900);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [hasUnsavedNotes, isLoading, notesModalOpen, saveNotes]);

  const closeNotesModal = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    void saveNotes(draftNotesRef.current);
    setEditorFocused(false);
    setNotesModalOpen(false);
  }, [saveNotes]);

  const toggleSavedHeader = useCallback((id: string) => {
    setSelectedHeaderIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }, []);

  const openHeadersModal = useCallback(() => {
    Keyboard.dismiss();
    setEditorFocused(false);
    setSelectedHeaderIds([]);
    setHeadersModalOpen(true);
    void saveNotes(draftNotesRef.current);
    fetchWeeklyPlanNoteHeaders()
      .then((headers) => {
        if (mountedRef.current) setSavedHeaders(headers);
      })
      .catch(() => undefined);
  }, [saveNotes]);

  const insertSelectedHeaders = useCallback(() => {
    const selectedHeaders = selectedHeaderIds
      .map((id) => availableHeaders.find((header) => header.id === id))
      .filter((header): header is WeeklyPlanNoteHeader => Boolean(header));
    if (!selectedHeaders.length) {
      setHeadersModalOpen(false);
      return;
    }

    const html = selectedHeaders
      .map((header) => `<h1>${escapeHtml(header.text)}</h1><p><br></p>`)
      .join("");
    editorRef.current?.insertHTML(html);
    setHeadersModalOpen(false);
    setSelectedHeaderIds([]);
    setEditorFocused(true);
  }, [availableHeaders, selectedHeaderIds]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 20 },
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
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderText}>
              <PageHeaderTitle title="Plan" />
              <PlanSectionHeaderTabs currentView="weekly-plan" />
            </View>
            <Pressable
              accessibilityLabel="Today"
              accessibilityRole="button"
              onPress={goToToday}
              style={({ pressed }) => [
                styles.todayButton,
                { borderColor: theme.tabBorder },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.todayText, { color: theme.primary }]}>
                Today
              </Text>
            </Pressable>
          </View>

          <View style={[styles.container, { maxWidth: MaxContentWidth }]}>
            {selectedDayEvents.length === 0 &&
            googleStatus === "not_connected" ? (
              <View
                style={[
                  styles.calendarEmptyState,
                  {
                    backgroundColor: theme.tabBar,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <Text
                  style={[styles.calendarEmptyTitle, { color: theme.text }]}
                >
                  No events for this day
                </Text>
                <Text
                  style={[
                    styles.calendarEmptyDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  Connect Google Calendar to import events.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSyncingGoogleCalendar}
                  onPress={() => void syncGoogleCalendar()}
                  style={({ pressed }) => [
                    styles.calendarSyncButton,
                    { backgroundColor: theme.primary },
                    isSyncingGoogleCalendar && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.calendarSyncButtonText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    {isSyncingGoogleCalendar ? "Syncing..." : "Sync Calendar"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View
              style={[
                styles.calendarCard,
                {
                  backgroundColor: theme.tabBar,
                  borderColor: theme.tabBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.weekControl,
                  { borderBottomColor: theme.tabBorder },
                ]}
              >
                <View style={styles.weekControlHeader}>
                  <Pressable
                    accessibilityLabel="Previous week"
                    accessibilityRole="button"
                    onPress={() => navigateWeek(-1)}
                    style={({ pressed }) => [
                      styles.navButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <SymbolView
                      name={sym("chevron.left", "chevron-left")}
                      size={15}
                      tintColor={theme.textSecondary}
                    />
                  </Pressable>
                  <Text
                    style={[styles.weekTitle, { color: theme.textSecondary }]}
                  >
                    {formatCompactWeekRange(weekStartDate)}
                  </Text>
                  <Pressable
                    accessibilityLabel="Next week"
                    accessibilityRole="button"
                    onPress={() => navigateWeek(1)}
                    style={({ pressed }) => [
                      styles.navButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <SymbolView
                      name={sym("chevron.right", "chevron-right")}
                      size={15}
                      tintColor={theme.textSecondary}
                    />
                  </Pressable>
                </View>
                <View style={styles.weekDaysTrack}>
                  <View style={styles.weekDaysSpacer} />
                  <View style={styles.weekDaysRow}>
                    {weekDays.map((date) => {
                      const dateKey = toDateKey(date);
                      const isSelected = dateKey === selectedDateKey;
                      const isToday = dateKey === todayKey;

                      return (
                        <Pressable
                          key={dateKey}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => selectDate(date)}
                          style={({ pressed }) => [
                            styles.dayPill,
                            isSelected && {
                              backgroundColor: theme.backgroundSelected,
                            },
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayName,
                              { color: theme.textSecondary },
                              isSelected && { color: theme.text },
                            ]}
                          >
                            {DAY_NAMES[date.getDay()].slice(0, 1)}
                          </Text>
                          <View
                            style={[
                              styles.dayNumberCircle,
                              isToday && {
                                backgroundColor: theme.primary,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayNumber,
                                {
                                  color: isToday
                                    ? theme.primaryForeground
                                    : theme.text,
                                },
                              ]}
                            >
                              {date.getDate()}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.allDayRow,
                  { borderBottomColor: theme.tabBorder },
                ]}
              >
                <Text
                  style={[styles.allDayLabel, { color: theme.textSecondary }]}
                >
                  All day
                </Text>
                <View style={styles.allDayColumns}>
                  {weekDays.map((day) => {
                    const dateKey = toDateKey(day);
                    const allDayEvents =
                      weekEventsByDate
                        .get(dateKey)
                        ?.filter((event) => !event.startTime) ?? [];
                    return (
                      <View key={dateKey} style={styles.allDayColumn}>
                        {allDayEvents.slice(0, 1).map((event) => (
                          <EventChip key={event.id} event={event} />
                        ))}
                        {allDayEvents.length > 1 ? (
                          <Text
                            style={[
                              styles.allDayOverflow,
                              { color: theme.textSecondary },
                            ]}
                          >
                            +{allDayEvents.length - 1}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.timeGrid}>
                <View style={styles.timeLabels}>
                  {HOURS.map((hour) => (
                    <View key={hour} style={styles.hourLabelRow}>
                      <Text
                        style={[
                          styles.hourLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {formatHour(hour)}
                      </Text>
                    </View>
                  ))}
                </View>
                <View
                  style={[
                    styles.dayGrid,
                    {
                      borderLeftColor: theme.tabBorder,
                    },
                  ]}
                >
                  {HOURS.map((hour) => (
                    <View
                      key={hour}
                      pointerEvents="none"
                      style={[
                        styles.hourLine,
                        {
                          borderTopColor: theme.tabBorder,
                          top: (hour - HOURS[0]) * HOUR_HEIGHT,
                        },
                      ]}
                    />
                  ))}
                  {weekDays.map((day, dayIndex) => {
                    const dateKey = toDateKey(day);
                    const timedEvents =
                      weekEventsByDate
                        .get(dateKey)
                        ?.filter((event) => event.startTime) ?? [];
                    const laidOutEvents = layoutWeekDayEvents(timedEvents);
                    return (
                      <View
                        key={dateKey}
                        style={[
                          styles.dayColumn,
                          {
                            borderLeftColor:
                              dayIndex === 0 ? "transparent" : theme.tabBorder,
                          },
                        ]}
                      >
                        {laidOutEvents.map(
                          ({ event, laneCount, laneIndex }) => (
                            <EventBlock
                              key={event.id}
                              event={event}
                              laneCount={laneCount}
                              laneIndex={laneIndex}
                            />
                          ),
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            <View
              style={[
                styles.notesCard,
                {
                  backgroundColor: theme.tabBar,
                  borderColor: theme.tabBorder,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open weekly notes"
                onPress={() => setNotesModalOpen(true)}
                style={({ pressed }) => [
                  styles.notesPreviewButton,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.notesHeader}>
                  <View style={styles.notesHeaderText}>
                    <Text style={[styles.notesTitle, { color: theme.text }]}>
                      Weekly notes
                    </Text>
                  </View>
                </View>
                {notesPreview ? (
                  <Text
                    numberOfLines={5}
                    style={[styles.notesPreview, { color: theme.text }]}
                  >
                    {notesPreview}
                  </Text>
                ) : (
                  <View style={styles.emptyNotesPreview} />
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <Modal
        animationType="slide"
        onRequestClose={closeNotesModal}
        presentationStyle="fullScreen"
        visible={notesModalOpen}
      >
        <View
          style={[styles.notesModal, { backgroundColor: theme.background }]}
        >
          <SafeAreaView edges={["left", "right"]} style={styles.safeArea}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.notesModalKeyboard}
            >
              <View
                style={[
                  styles.notesModalHeader,
                  {
                    borderBottomColor: theme.tabBorder,
                    paddingTop: insets.top + 10,
                  },
                ]}
              >
                <View style={styles.notesModalTitleBlock}>
                  <Text style={[styles.notesModalTitle, { color: theme.text }]}>
                    Weekly notes
                  </Text>
                  <Text
                    style={[
                      styles.notesModalStatus,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {isSavingNotes
                      ? "Saving..."
                      : hasUnsavedNotes
                        ? "Autosaving"
                        : "Saved"}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Done editing weekly notes"
                  onPress={closeNotesModal}
                  style={({ pressed }) => [
                    styles.doneButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.doneButtonText, { color: theme.primary }]}
                  >
                    Done
                  </Text>
                </Pressable>
              </View>

              {editorFocused ? (
                <View
                  style={[
                    styles.modalToolbarRow,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderBottomColor: theme.tabBorder,
                    },
                  ]}
                >
                  <RichToolbar
                    actions={EDITOR_ACTIONS}
                    getEditor={() => editorRef.current as RichEditor}
                    iconMap={toolbarIconMap}
                    iconTint={theme.textSecondary}
                    selectedIconTint={theme.primary}
                    style={styles.modalToolbar}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add saved header"
                    onPress={openHeadersModal}
                    style={({ pressed }) => [
                      styles.savedHeadersButton,
                      { backgroundColor: theme.tabBar },
                      pressed && styles.pressed,
                    ]}
                  >
                    <SymbolView
                      name={sym("text.badge.plus", "text-plus")}
                      size={18}
                      tintColor={theme.primary}
                    />
                    <Text
                      style={[
                        styles.savedHeadersButtonText,
                        { color: theme.primary },
                      ]}
                    >
                      Headers
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <RichEditor
                key={`modal-${weekStartKey}`}
                ref={editorRef}
                autoCapitalize="sentences"
                autoCorrect
                defaultParagraphSeparator="p"
                editorStyle={editorStyle}
                initialContentHTML={draftNotes}
                initialHeight={620}
                onBlur={() => setEditorFocused(false)}
                onChange={setDraftNotes}
                onFocus={() => setEditorFocused(true)}
                placeholder="Type type type..."
                style={styles.modalEditor}
                styleWithCSS={false}
              />
              {error ? (
                <Text
                  style={[
                    styles.modalErrorText,
                    { color: theme.primary, borderTopColor: theme.tabBorder },
                  ]}
                >
                  {error}
                </Text>
              ) : null}
            </KeyboardAvoidingView>
          </SafeAreaView>
          {headersModalOpen ? (
            <View style={styles.headerPickerOverlay}>
              <Pressable
                accessibilityLabel="Close saved headers"
                style={styles.headerPickerBackdrop}
                onPress={() => setHeadersModalOpen(false)}
              />
              <View
                style={[
                  styles.headerPickerSheet,
                  {
                    backgroundColor: theme.tabBar,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <View style={styles.headerPickerTopRow}>
                  <View style={styles.headerPickerTitleBlock}>
                    <Text
                      style={[styles.headerPickerTitle, { color: theme.text }]}
                    >
                      Saved headers
                    </Text>
                    <Text
                      style={[
                        styles.headerPickerSubtitle,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Tap headers in the order you want them inserted.
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Insert selected headers"
                    disabled={!selectedHeaderIds.length}
                    onPress={insertSelectedHeaders}
                    style={({ pressed }) => [
                      styles.insertHeadersButton,
                      {
                        backgroundColor: selectedHeaderIds.length
                          ? theme.primary
                          : theme.backgroundElement,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.insertHeadersButtonText,
                        {
                          color: selectedHeaderIds.length
                            ? theme.primaryForeground
                            : theme.textSecondary,
                        },
                      ]}
                    >
                      Add
                    </Text>
                  </Pressable>
                </View>

                <ScrollView
                  contentContainerStyle={styles.headerPickerList}
                  showsVerticalScrollIndicator={false}
                >
                  {availableHeaders.length ? (
                    availableHeaders.map((header) => {
                      const selectedIndex = selectedHeaderIds.indexOf(
                        header.id,
                      );
                      const isSelected = selectedIndex >= 0;
                      return (
                        <Pressable
                          key={header.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => toggleSavedHeader(header.id)}
                          style={({ pressed }) => [
                            styles.headerOption,
                            { borderBottomColor: theme.tabBorder },
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.headerOptionText,
                              { color: theme.text },
                            ]}
                          >
                            {header.text}
                          </Text>
                          {isSelected ? (
                            <View
                              style={[
                                styles.headerSelectionBadge,
                                { backgroundColor: theme.primary },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.headerSelectionBadgeText,
                                  { color: theme.primaryForeground },
                                ]}
                              >
                                {selectedIndex + 1}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text
                      style={[
                        styles.emptyHeadersText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Format a line as H in weekly notes to save it here.
                    </Text>
                  )}
                </ScrollView>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function compareEvents(left: WeekEvent, right: WeekEvent): number {
  const leftTime = left.startTime ?? "99:99";
  const rightTime = right.startTime ?? "99:99";
  return (
    leftTime.localeCompare(rightTime) || left.title.localeCompare(right.title)
  );
}

function EventChip({ event }: { event: WeekEvent }) {
  const theme = useTheme();
  const palette = eventPalette(event.sourceType, theme);

  return (
    <View style={[styles.eventChip, { backgroundColor: palette.bg }]}>
      <Text
        ellipsizeMode="clip"
        numberOfLines={1}
        style={[styles.eventChipText, { color: palette.text }]}
      >
        {event.title}
      </Text>
    </View>
  );
}

function EventBlock({
  event,
  laneCount,
  laneIndex,
}: {
  event: WeekEvent;
  laneCount: number;
  laneIndex: number;
}) {
  const theme = useTheme();
  const palette = eventPalette(event.sourceType, theme);
  const { end, start } = getEventMinutes(event);
  const top = ((start - GRID_START_MINUTES) / 60) * HOUR_HEIGHT + 3;
  const height = ((end - start) / 60) * HOUR_HEIGHT - 3;
  const laneWidth = 100 / laneCount;

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.eventBlock,
        {
          backgroundColor: palette.bg,
          height: Math.max(height, 16),
          left: `${laneIndex * laneWidth}%`,
          top,
          width: `${laneWidth}%`,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text
        ellipsizeMode="clip"
        numberOfLines={height >= 30 ? 2 : 1}
        style={[styles.eventTitle, { color: palette.text }]}
      >
        {event.title}
      </Text>
      {height >= 34 && laneWidth >= 50 ? (
        <Text
          ellipsizeMode="clip"
          numberOfLines={1}
          style={[styles.eventTime, { color: palette.text }]}
        >
          {formatEventTime(event)}
        </Text>
      ) : null}
    </Pressable>
  );
}

function eventPalette(
  sourceType: WeekEventSourceType,
  theme: ReturnType<typeof useTheme>,
) {
  if (sourceType === "google") {
    return { bg: "#5F6368", text: "#FFFFFF" };
  }
  if (
    sourceType === "task" ||
    sourceType === "goal_checkpoint" ||
    sourceType === "habit_instance"
  ) {
    return { bg: theme.primary, text: "#07171D" };
  }
  return { bg: "#8E8E93", text: "#FFFFFF" };
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  allDayColumn: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 2,
  },
  allDayColumns: {
    flex: 1,
    flexDirection: "row",
  },
  allDayLabel: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 12,
    width: TIME_LABEL_WIDTH,
  },
  allDayOverflow: {
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 11,
    paddingHorizontal: 4,
  },
  allDayRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: ALL_DAY_ROW_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  calendarCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  calendarEmptyDescription: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 19,
    textAlign: "center",
  },
  calendarEmptyState: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  calendarEmptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
    textAlign: "center",
  },
  calendarSyncButton: {
    borderRadius: 999,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  calendarSyncButtonText: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  container: {
    alignSelf: "center",
    gap: 10,
    width: "100%",
  },
  content: {
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  dayColumn: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    flex: 1,
    height: GRID_HEIGHT,
    minWidth: 0,
    position: "relative",
  },
  dayGrid: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    height: GRID_HEIGHT,
    position: "relative",
  },
  dayName: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 11,
  },
  disabled: {
    opacity: 0.55,
  },
  dayNumber: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 15,
  },
  dayNumberCircle: {
    alignItems: "center",
    borderRadius: 999,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  dayPill: {
    alignItems: "center",
    borderRadius: 9,
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingVertical: 2,
  },
  emptyNotesPreview: {
    minHeight: 54,
  },
  emptyHeadersText: {
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 21,
    paddingHorizontal: 4,
    paddingVertical: 18,
  },
  doneButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  doneButtonText: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 21,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
  },
  eventBlock: {
    borderRadius: 6,
    gap: 0,
    minWidth: 0,
    overflow: "hidden",
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: "absolute",
  },
  eventChip: {
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  eventChipText: {
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 10,
  },
  eventTime: {
    fontSize: 8.5,
    fontWeight: "600",
    lineHeight: 10,
    opacity: 0.82,
  },
  eventTitle: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 11,
  },
  headingActionText: {
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 20,
  },
  headerOption: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
  },
  headerOptionText: {
    flex: 1,
    fontSize: 17,
    fontWeight: "500",
    lineHeight: 22,
  },
  headerPickerBackdrop: {
    flex: 1,
  },
  headerPickerList: {
    paddingBottom: 20,
    paddingHorizontal: 18,
  },
  headerPickerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#00000088",
    justifyContent: "flex-end",
    zIndex: 40,
  },
  headerPickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: "72%",
    overflow: "hidden",
    paddingTop: 18,
  },
  headerPickerSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 18,
    marginTop: 2,
  },
  headerPickerTitle: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 27,
  },
  headerPickerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerPickerTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    paddingBottom: 12,
    paddingHorizontal: 18,
  },
  headerSelectionBadge: {
    alignItems: "center",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  headerSelectionBadgeText: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 17,
  },
  hourLabel: {
    fontSize: 9,
    fontWeight: "500",
    lineHeight: 11,
  },
  hourLabelRow: {
    height: HOUR_HEIGHT,
  },
  hourLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    right: 0,
  },
  insertHeadersButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  insertHeadersButtonText: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 18,
  },
  navButton: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 28,
  },
  notesCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 0,
    overflow: "hidden",
  },
  notesHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  notesHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  notesModal: {
    flex: 1,
  },
  notesModalHeader: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  notesModalKeyboard: {
    flex: 1,
  },
  notesModalStatus: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
    marginTop: 1,
  },
  notesModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 24,
  },
  notesModalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  notesPreview: {
    fontSize: 18,
    fontWeight: "400",
    lineHeight: 25,
    marginTop: 18,
  },
  notesPreviewButton: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  notesSubtitle: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 21,
    marginTop: 4,
  },
  notesTitle: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 29,
  },
  pageHeader: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    maxWidth: MaxContentWidth,
    minHeight: 42,
    width: "100%",
  },
  pageHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  pressed: {
    opacity: 0.72,
  },
  safeArea: {
    flex: 1,
  },
  saveButton: {
    borderRadius: 999,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 16,
  },
  savedHeadersButton: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  savedHeadersButtonText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
  },
  screen: {
    flex: 1,
  },
  modalEditor: {
    flex: 1,
  },
  modalErrorText: {
    borderTopWidth: StyleSheet.hairlineWidth,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  modalToolbar: {
    flex: 1,
    minHeight: 46,
  },
  modalToolbarRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingRight: 10,
  },
  timeGrid: {
    flexDirection: "row",
  },
  timeLabels: {
    paddingLeft: 7,
    paddingTop: 2,
    width: TIME_LABEL_WIDTH,
  },
  todayButton: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  todayText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 18,
  },
  toolbar: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  weekControl: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 1,
    paddingHorizontal: 6,
    paddingTop: 3,
    paddingBottom: 4,
  },
  weekControlHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 18,
    width: "100%",
  },
  weekDaysRow: {
    flex: 1,
    flexDirection: "row",
  },
  weekDaysSpacer: {
    flexShrink: 0,
    width: TIME_LABEL_WIDTH,
  },
  weekDaysTrack: {
    flexDirection: "row",
    width: "100%",
  },
  weekTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 13,
    textAlign: "center",
  },
});
