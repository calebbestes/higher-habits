"use client";

import {
  type CalendarHabitKey,
  type CustomDayIconKey,
  type CustomDayIconSelection,
  type DayDrawerNotes,
  type DrawerNoteKey,
  EMPTY_DAY_DRAWER_NOTES,
  EMPTY_PRAYER_CHECKLIST,
  EMPTY_SALES_CHECKLIST,
  EMPTY_WEIGHT_CHECKLIST,
  type PrayerChecklistState,
  type SalesActivityInput,
  type SalesActivityLog,
  type SalesChecklistState,
  type WeightChecklistState,
  getMonthKey,
  toDateKey,
} from "@/lib/habit-state";
import {
  createSalesActivity,
  fetchHabitMonthSnapshot,
  persistCustomDayIcon,
  persistDayHabit,
  persistDrawerNote,
  persistPrayerChecklist,
  persistSalesChecklist,
  persistWeightChecklist,
} from "@/lib/habit-state-client";
import {
  EMPTY_GOAL_LOGS_SNAPSHOT,
  fetchGoalLogsSnapshot,
  setGoalLog,
  setGoalLogNote,
  type CategoryWithGoals,
  type GoalLogsSnapshot,
} from "@/lib/goal-logs-client";
import { fetchCalendarBootstrap } from "@/lib/calendar-bootstrap-client";
import type { CalendarBootstrapData } from "@/lib/calendar-bootstrap-types";
import { CategoryGoalDrawer } from "./category-goal-drawer";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  Textarea,
  Tooltip,
  addToast,
  useDisclosure,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CUSTOM_DAY_ICON_OPTIONS,
  DayIconPickerDrawer,
} from "./day-icon-picker-drawer";
import { PRAYER_CHECKLIST_ITEMS } from "./prayer-checklist-drawer";
import { SALES_CHECKLIST_ITEMS } from "./sales-outreach-drawer";
import { WEIGHT_CHECKLIST_ITEMS } from "./weight-checklist-drawer";
import { RichTextEditor } from "./rich-text-editor";

type CalendarView = "month" | "week" | "day";

export type PortableCalendarCategory = {
  id: string;
  name: string;
  color: string;
};

export type PortableCalendarEntry = {
  id: string;
  title: string;
  start: Date | string | number;
  end?: Date | string | number;
  notes?: string;
  color?: string;
  category?: PortableCalendarCategory | null;
};

type NormalizedCalendarEntry = Omit<
  PortableCalendarEntry,
  "start" | "end" | "category"
> & {
  start: Date;
  end: Date;
  category: PortableCalendarCategory;
  color: string;
};

type CategoryFilter = PortableCalendarCategory & {
  eventCount: number;
};

type PortableCalendarProps = {
  entries?: PortableCalendarEntry[];
  initialDate?: Date | string | number;
  initialCalendarData?: CalendarBootstrapData | null;
  initialView?: CalendarView;
  title?: string;
  allowCreate?: boolean;
  onDateSelect?: (date: Date) => void;
  onEntrySelect?: (entry: PortableCalendarEntry) => void;
  onEntriesChange?: (entries: PortableCalendarEntry[]) => void;
};

type DraftEntry = {
  title: string;
  start: string;
  end: string;
  notes: string;
  categoryName: string;
  categoryColor: string;
};

const DEFAULT_ENTRY_COLOR = "#f59e9e";
const UNCATEGORIZED_CATEGORY: PortableCalendarCategory = {
  id: "__uncategorized__",
  name: "Uncategorized",
  color: "#94a3b8",
};

const CORE_CATEGORIES: PortableCalendarCategory[] = [
  { id: "spiritual", name: "Spiritual", color: "#8b5cf6" },
  { id: "physical", name: "Physical", color: "#22c55e" },
  { id: "social", name: "Social", color: "#3b82f6" },
  { id: "financial-career", name: "Financial/Career", color: "#f59e0b" },
];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_HABIT_ICONS = [
  { key: "prayer", label: "Spiritual", icon: "mdi:hands-pray" },
  { key: "gym", label: "Health", icon: "mdi:dumbbell" },
  { key: "outreach", label: "Career", icon: "mdi:currency-usd" },
] as const;

const CATEGORY_FILL_CONFIG: Record<string, { fill: string; bar: string; label: string }> = {
  Spiritual: { fill: "text-teal-600", bar: "bg-teal-500", label: "text-teal-600" },
  Physical:  { fill: "text-[#F59E0C]", bar: "bg-[#F59E0C]",  label: "text-[#F59E0C]" },
  Work:      { fill: "text-purple-600", bar: "bg-purple-600", label: "text-purple-600" },
};
const DEFAULT_CATEGORY_FILL = { fill: "text-foreground-600", bar: "bg-foreground-400", label: "text-foreground-500" };

const ROW_START = ["row-start-1", "row-start-2", "row-start-3"] as const;

const cn = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

const toDate = (value?: Date | string | number) => {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value);
  if (typeof value === "string" && DATE_ONLY_REGEX.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const startOfWeek = (date: Date) => {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const addWeeks = (date: Date, amount: number) => addDays(date, amount * 7);

const addMonths = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth() + amount, date.getDate());

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isSameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const isToday = (date: Date) => isSameDay(date, new Date());

const withAlpha = (color: string, alphaHex: string) =>
  HEX_COLOR_REGEX.test(color) ? `${color}${alphaHex}` : color;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const formatMonthYear = (date: Date) =>
  `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;

const formatDayLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

const getHabitStateKey = (dateKey: string, habitKey: CalendarHabitKey) =>
  `${dateKey}::${habitKey}`;

const formatWeekRange = (date: Date) => {
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();

  if (sameMonth && sameYear) {
    return `${
      MONTH_NAMES[weekStart.getMonth()]
    } ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }

  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(weekStart)} - ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(weekEnd)}`;
};

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

const formatDateTimeLocalValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatEntryTiming = (entry: NormalizedCalendarEntry) => {
  const startsAtMidnight =
    entry.start.getHours() === 0 && entry.start.getMinutes() === 0;
  const endsAtEndOfDay =
    entry.end.getHours() === 23 && entry.end.getMinutes() >= 59;
  const spansMultipleDays =
    startOfDay(entry.start).getTime() !== startOfDay(entry.end).getTime();

  if (spansMultipleDays || (startsAtMidnight && endsAtEndOfDay)) {
    return "All day";
  }

  return `${formatTime(entry.start)} - ${formatTime(entry.end)}`;
};

const resolveCategory = (
  category: PortableCalendarCategory | null | undefined,
): PortableCalendarCategory => {
  if (!category) {
    return UNCATEGORIZED_CATEGORY;
  }

  const coreMatch = CORE_CATEGORIES.find(
    (core) =>
      core.id === category.id ||
      core.name.toLowerCase() === category.name.toLowerCase(),
  );

  return coreMatch ?? category;
};

const normalizeEntry = (
  entry: PortableCalendarEntry,
): NormalizedCalendarEntry => {
  const start = toDate(entry.start);
  const rawEnd = entry.end ? toDate(entry.end) : new Date(start);
  const end = rawEnd.getTime() >= start.getTime() ? rawEnd : new Date(start);
  const category = resolveCategory(entry.category);
  const color = category.color ?? entry.color ?? DEFAULT_ENTRY_COLOR;

  return {
    ...entry,
    start,
    end,
    category,
    color,
  };
};

const compareEntries = (
  a: NormalizedCalendarEntry,
  b: NormalizedCalendarEntry,
) =>
  a.start.getTime() - b.start.getTime() ||
  a.end.getTime() - b.end.getTime() ||
  a.title.localeCompare(b.title);

const isDateInEntryRange = (date: Date, entry: NormalizedCalendarEntry) => {
  const value = startOfDay(date).getTime();
  return (
    value >= startOfDay(entry.start).getTime() &&
    value <= startOfDay(entry.end).getTime()
  );
};

const buildMonthWeeks = (currentDate: Date) => {
  const monthStart = startOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart);
  const cells = Array.from({ length: 35 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      isOutside: !isSameMonth(date, currentDate),
    };
  });

  return Array.from({ length: 5 }, (_, weekIndex) =>
    cells.slice(weekIndex * 7, weekIndex * 7 + 7),
  );
};

const titleForView = (view: CalendarView, currentDate: Date) => {
  if (view === "day") return formatDayLabel(currentDate);
  if (view === "week") return formatWeekRange(currentDate);
  return formatMonthYear(currentDate);
};

const navigateDate = (date: Date, view: CalendarView, direction: number) => {
  if (view === "day") return addDays(date, direction);
  if (view === "week") return addWeeks(date, direction);
  return addMonths(date, direction);
};

const ProgressFillIcon = ({
  icon,
  progress,
  className,
  fillClassName,
}: {
  icon: string;
  progress: number;
  className?: string;
  fillClassName?: string;
}) => {
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const topInset = `${100 - clampedProgress * 100}%`;

  return (
    <span className={cn("relative block h-3.5 w-3.5", className)}>
      <Icon
        icon={icon}
        className="absolute inset-0 h-full w-full text-foreground-300"
      />
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(${topInset} 0 0 0)` }}
      >
        <Icon
          icon={icon}
          className={cn(
            "absolute inset-0 h-full w-full",
            fillClassName ?? "text-teal-600",
          )}
        />
      </span>
    </span>
  );
};

const PrayerProgressIcon = ({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) => (
  <ProgressFillIcon
    icon="mdi:hands-pray"
    progress={progress}
    className={className}
  />
);

const WeightProgressIcon = ({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) => (
  <ProgressFillIcon
    icon="mdi:dumbbell"
    progress={progress}
    className={className}
    fillClassName="text-[#F59E0C]"
  />
);

const SalesProgressIcon = ({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) => (
  <ProgressFillIcon
    icon="mdi:currency-usd"
    progress={progress}
    className={className}
    fillClassName="text-purple-600"
  />
);

const SearchIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    className="h-4 w-4"
    stroke="currentColor"
    strokeWidth="1.8"
    role="img"
    aria-label="Search"
  >
    <title>Search</title>
    <circle cx="8.5" cy="8.5" r="5.5" />
    <path d="m13 13 4 4" strokeLinecap="round" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    className="h-4 w-4"
    stroke="currentColor"
    strokeWidth="1.8"
    role="img"
    aria-label="Previous"
  >
    <title>Previous</title>
    <path d="m12.5 4.5-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    className="h-4 w-4"
    stroke="currentColor"
    strokeWidth="1.8"
    role="img"
    aria-label="Next"
  >
    <title>Next</title>
    <path d="m7.5 4.5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    className="h-4 w-4"
    stroke="currentColor"
    strokeWidth="1.8"
    role="img"
    aria-label="Close"
  >
    <title>Close</title>
    <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
  </svg>
);

const PlusIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    className="h-4 w-4"
    stroke="currentColor"
    strokeWidth="1.8"
    role="img"
    aria-label="Add"
  >
    <title>Add</title>
    <path d="M10 4v12M4 10h12" strokeLinecap="round" />
  </svg>
);

const CategoryPill = ({
  entry,
  onPress,
  compact = false,
}: {
  entry: NormalizedCalendarEntry;
  onPress: () => void;
  compact?: boolean;
}) => (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      onPress();
    }}
    className={cn(
      "group relative flex w-full items-center gap-2 overflow-hidden rounded-lg pr-2 text-left transition-colors",
      compact ? "min-h-8 pl-3.5" : "min-h-9 pl-4",
    )}
    style={{ backgroundColor: withAlpha(entry.color, compact ? "18" : "14") }}
    title={`${entry.title} • ${entry.category.name} • ${formatEntryTiming(
      entry,
    )}`}
  >
    <span
      className="absolute top-1 bottom-1 left-1 w-1 rounded-full"
      style={{ backgroundColor: entry.color }}
    />
    <span
      className={cn(
        "min-w-0 flex-1 truncate font-medium",
        compact ? "text-[11px]" : "text-xs",
      )}
      style={{ color: entry.color }}
    >
      {entry.title}
    </span>
    <span
      className={cn(
        "shrink-0 font-medium opacity-70",
        compact ? "text-[10px]" : "text-[11px]",
      )}
      style={{ color: entry.color }}
    >
      {formatEntryTiming(entry) === "All day"
        ? "All day"
        : formatTime(entry.start)}
    </span>
  </button>
);

const MonthView = ({
  currentDate,
  selectedDate,
  entries,
  onSelectDate,
  onSelectEntry,
  hiddenGoalKeys,
  onCustomDayIconsByDateChange,
  onPrayerChecklistsByDateChange,
  onWeightChecklistsByDateChange,
  onSalesChecklistsByDateChange,
  onGoalLogsSnapshotChange,
}: {
  currentDate: Date;
  selectedDate: Date;
  entries: NormalizedCalendarEntry[];
  onSelectDate: (date: Date) => void;
  onSelectEntry: (entry: NormalizedCalendarEntry) => void;
  hiddenGoalKeys?: Set<string>;
  onCustomDayIconsByDateChange?: (
    data: Record<string, CustomDayIconSelection | null>,
  ) => void;
  onPrayerChecklistsByDateChange?: (
    data: Record<string, PrayerChecklistState>,
  ) => void;
  onWeightChecklistsByDateChange?: (
    data: Record<string, WeightChecklistState>,
  ) => void;
  onSalesChecklistsByDateChange?: (
    data: Record<string, SalesChecklistState>,
  ) => void;
  onGoalLogsSnapshotChange?: (snapshot: GoalLogsSnapshot) => void;
}) => {
  const [selectedDayForOverflow, setSelectedDayForOverflow] =
    useState<Date | null>(null);
  const [activeHabitIcons, setActiveHabitIcons] = useState<Set<string>>(
    new Set(),
  );
  const [prayerChecklistsByDate, setPrayerChecklistsByDate] = useState<
    Record<string, PrayerChecklistState>
  >({});
  useEffect(() => {
    onPrayerChecklistsByDateChange?.(prayerChecklistsByDate);
  }, [prayerChecklistsByDate, onPrayerChecklistsByDateChange]);
  const [weightChecklistsByDate, setWeightChecklistsByDate] = useState<
    Record<string, WeightChecklistState>
  >({});
  useEffect(() => {
    onWeightChecklistsByDateChange?.(weightChecklistsByDate);
  }, [weightChecklistsByDate, onWeightChecklistsByDateChange]);
  const [drawerNotesByDate, setDrawerNotesByDate] = useState<
    Record<string, DayDrawerNotes>
  >({});
  const [customDayIconsByDate, setCustomDayIconsByDate] = useState<
    Record<string, CustomDayIconSelection | null>
  >({});
  useEffect(() => {
    onCustomDayIconsByDateChange?.(customDayIconsByDate);
  }, [customDayIconsByDate, onCustomDayIconsByDateChange]);
  const [salesChecklistsByDate, setSalesChecklistsByDate] = useState<
    Record<string, SalesChecklistState>
  >({});
  useEffect(() => {
    onSalesChecklistsByDateChange?.(salesChecklistsByDate);
  }, [salesChecklistsByDate, onSalesChecklistsByDateChange]);
  const [salesByDate, setSalesByDate] = useState<
    Record<string, SalesActivityLog[]>
  >({});
  const [goalLogsSnapshot, setGoalLogsSnapshot] = useState<GoalLogsSnapshot>(EMPTY_GOAL_LOGS_SNAPSHOT);
  useEffect(() => {
    onGoalLogsSnapshotChange?.(goalLogsSnapshot);
  }, [goalLogsSnapshot, onGoalLogsSnapshotChange]);
  const [activeDrawerCategoryId, setActiveDrawerCategoryId] = useState<string | null>(null);
  const [activeDrawerDate, setActiveDrawerDate] = useState<Date | null>(null);

  const [prayerDrawerDate, setPrayerDrawerDate] = useState<Date | null>(null);
  const [weightDrawerDate, setWeightDrawerDate] = useState<Date | null>(null);
  const [salesDrawerDate, setSalesDrawerDate] = useState<Date | null>(null);
  const [iconPickerDate, setIconPickerDate] = useState<Date | null>(null);
  const [iconPickerSlot, setIconPickerSlot] = useState<number>(0);
  const weeks = useMemo(() => buildMonthWeeks(currentDate), [currentDate]);
  const currentMonthKey = useMemo(
    () => getMonthKey(currentDate),
    [currentDate],
  );
  const showCount = 3;

  const prevMonthKey = useMemo(() => {
    const d = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - 1,
      1,
    );
    return getMonthKey(d);
  }, [currentDate]);

  useEffect(() => {
    let cancelled = false;

    const loadMonthSnapshot = async () => {
      try {
        const [snapshot, prevSnapshot, goalsSnap, prevGoalsSnap] = await Promise.all([
          fetchHabitMonthSnapshot(currentMonthKey),
          fetchHabitMonthSnapshot(prevMonthKey),
          fetchGoalLogsSnapshot(currentMonthKey),
          fetchGoalLogsSnapshot(prevMonthKey),
        ]);

        if (cancelled) {
          return;
        }

        setActiveHabitIcons((previous) => {
          const next = new Set(
            [...previous].filter(
              (key) =>
                !key.startsWith(`${currentMonthKey}-`) &&
                !key.startsWith(`${prevMonthKey}-`),
            ),
          );

          for (const habit of [
            ...snapshot.dayHabits,
            ...prevSnapshot.dayHabits,
          ]) {
            if (habit.isActive) {
              next.add(getHabitStateKey(habit.dateKey, habit.habitKey));
            }
          }

          return next;
        });

        setPrayerChecklistsByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) =>
                !dateKey.startsWith(currentMonthKey) &&
                !dateKey.startsWith(prevMonthKey),
            ),
          ),
          ...prevSnapshot.prayerChecklistsByDate,
          ...snapshot.prayerChecklistsByDate,
        }));

        setCustomDayIconsByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) =>
                !dateKey.startsWith(currentMonthKey) &&
                !dateKey.startsWith(prevMonthKey),
            ),
          ),
          ...prevSnapshot.customDayIconsByDate,
          ...snapshot.customDayIconsByDate,
        }));

        setWeightChecklistsByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) =>
                !dateKey.startsWith(currentMonthKey) &&
                !dateKey.startsWith(prevMonthKey),
            ),
          ),
          ...prevSnapshot.weightChecklistsByDate,
          ...snapshot.weightChecklistsByDate,
        }));

        setDrawerNotesByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) =>
                !dateKey.startsWith(currentMonthKey) &&
                !dateKey.startsWith(prevMonthKey),
            ),
          ),
          ...prevSnapshot.drawerNotesByDate,
          ...snapshot.drawerNotesByDate,
        }));

        setSalesChecklistsByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) =>
                !dateKey.startsWith(currentMonthKey) &&
                !dateKey.startsWith(prevMonthKey),
            ),
          ),
          ...prevSnapshot.salesChecklistsByDate,
          ...snapshot.salesChecklistsByDate,
        }));

        setSalesByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) =>
                !dateKey.startsWith(currentMonthKey) &&
                !dateKey.startsWith(prevMonthKey),
            ),
          ),
          ...prevSnapshot.salesByDate,
          ...snapshot.salesByDate,
        }));

        setGoalLogsSnapshot((previous) => ({
          categories: goalsSnap.categories,
          periodicGoals: goalsSnap.periodicGoals,
          hiddenGoals: goalsSnap.hiddenGoals,
          logsByGoalDate: {
            ...Object.fromEntries(
              Object.entries(previous.logsByGoalDate).filter(([key]) => {
                const dateKey = key.slice(-10);
                return (
                  !dateKey.startsWith(currentMonthKey) &&
                  !dateKey.startsWith(prevMonthKey)
                );
              }),
            ),
            ...prevGoalsSnap.logsByGoalDate,
            ...goalsSnap.logsByGoalDate,
          },
          notesByGoalDate: {
            ...Object.fromEntries(
              Object.entries(previous.notesByGoalDate).filter(([key]) => {
                const dateKey = key.slice(-10);
                return (
                  !dateKey.startsWith(currentMonthKey) &&
                  !dateKey.startsWith(prevMonthKey)
                );
              }),
            ),
            ...(prevGoalsSnap.notesByGoalDate ?? {}),
            ...(goalsSnap.notesByGoalDate ?? {}),
          },
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }

        addToast({
          title: "Could not load habit data",
          description:
            error instanceof Error
              ? error.message
              : "We couldn't load this month's saved habits.",
          color: "warning",
        });
      }
    };

    void loadMonthSnapshot();

    return () => {
      cancelled = true;
    };
  }, [currentMonthKey, prevMonthKey]);

  const handleHabitIconClick = async (
    date: Date,
    habitKey: CalendarHabitKey,
  ) => {
    if (habitKey === "prayer") {
      setPrayerDrawerDate(startOfDay(date));
      setWeightDrawerDate(null);
      setSalesDrawerDate(null);
      setIconPickerDate(null);
      return;
    }

    if (habitKey === "gym") {
      setWeightDrawerDate(startOfDay(date));
      setPrayerDrawerDate(null);
      setSalesDrawerDate(null);
      setIconPickerDate(null);
      return;
    }

    if (habitKey === "outreach") {
      setSalesDrawerDate(startOfDay(date));
      setPrayerDrawerDate(null);
      setWeightDrawerDate(null);
      setIconPickerDate(null);
      return;
    }

    const dateKey = toDateKey(date);
    const iconKey = getHabitStateKey(dateKey, habitKey);
    const nextIsActive = !activeHabitIcons.has(iconKey);

    setActiveHabitIcons((previous) => {
      const next = new Set(previous);

      if (nextIsActive) {
        next.add(iconKey);
      } else {
        next.delete(iconKey);
      }

      return next;
    });

    try {
      await persistDayHabit({
        dateKey,
        habitKey,
        isActive: nextIsActive,
      });
    } catch (error) {
      setActiveHabitIcons((previous) => {
        const next = new Set(previous);

        if (nextIsActive) {
          next.delete(iconKey);
        } else {
          next.add(iconKey);
        }

        return next;
      });

      addToast({
        title: "Could not save that habit",
        description:
          error instanceof Error
            ? error.message
            : "We couldn't save that habit change to the database.",
        color: "danger",
      });
    }
  };

  const handlePrayerChecklistChange = (
    dateKey: string,
    nextChecklist: PrayerChecklistState,
  ) => {
    const previousChecklist =
      prayerChecklistsByDate[dateKey] ?? EMPTY_PRAYER_CHECKLIST;

    setPrayerChecklistsByDate((previous) => ({
      ...previous,
      [dateKey]: nextChecklist,
    }));

    void persistPrayerChecklist({
      dateKey,
      checklist: nextChecklist,
    }).catch((error) => {
      setPrayerChecklistsByDate((previous) => ({
        ...previous,
        [dateKey]: previousChecklist,
      }));

      addToast({
        title: "Could not save checklist",
        description:
          error instanceof Error
            ? error.message
            : "We couldn't save that prayer checklist change.",
        color: "danger",
      });
    });
  };

  const getPrayerProgress = (date: Date) => {
    const dateKey = toDateKey(date);
    const checklist = prayerChecklistsByDate[dateKey] ?? EMPTY_PRAYER_CHECKLIST;
    const completedCount = Object.values(checklist).filter(Boolean).length;

    return completedCount / PRAYER_CHECKLIST_ITEMS.length;
  };

  const handleOpenIconPicker = (date: Date, slotIndex: number) => {
    setIconPickerDate(startOfDay(date));
    setIconPickerSlot(slotIndex);
    setPrayerDrawerDate(null);
    setWeightDrawerDate(null);
    setSalesDrawerDate(null);
  };

  const handleWeightChecklistChange = (
    dateKey: string,
    nextChecklist: WeightChecklistState,
  ) => {
    const previousChecklist =
      weightChecklistsByDate[dateKey] ?? EMPTY_WEIGHT_CHECKLIST;

    setWeightChecklistsByDate((previous) => ({
      ...previous,
      [dateKey]: nextChecklist,
    }));

    void persistWeightChecklist({
      dateKey,
      checklist: nextChecklist,
    }).catch((error) => {
      setWeightChecklistsByDate((previous) => ({
        ...previous,
        [dateKey]: previousChecklist,
      }));

      addToast({
        title: "Could not save checklist",
        description:
          error instanceof Error
            ? error.message
            : "We couldn't save that weight checklist change.",
        color: "danger",
      });
    });
  };

  const handleSalesChecklistChange = (
    dateKey: string,
    nextChecklist: SalesChecklistState,
  ) => {
    const previousChecklist =
      salesChecklistsByDate[dateKey] ?? EMPTY_SALES_CHECKLIST;

    setSalesChecklistsByDate((previous) => ({
      ...previous,
      [dateKey]: nextChecklist,
    }));

    void persistSalesChecklist({ dateKey, checklist: nextChecklist }).catch(
      (error) => {
        setSalesChecklistsByDate((previous) => ({
          ...previous,
          [dateKey]: previousChecklist,
        }));

        addToast({
          title: "Could not save checklist",
          description:
            error instanceof Error
              ? error.message
              : "We couldn't save that sales checklist change.",
          color: "danger",
        });
      },
    );
  };

  const getSalesProgress = (date: Date) => {
    const dateKey = toDateKey(date);
    const checklist = salesChecklistsByDate[dateKey] ?? EMPTY_SALES_CHECKLIST;
    return Object.values(checklist).filter(Boolean).length / 6;
  };

  const getWeightProgress = (date: Date) => {
    const dateKey = toDateKey(date);
    const checklist = weightChecklistsByDate[dateKey] ?? EMPTY_WEIGHT_CHECKLIST;
    const completedCount = Object.values(checklist).filter(Boolean).length;

    return completedCount / WEIGHT_CHECKLIST_ITEMS.length;
  };

  const handleCustomDayIconChange = (
    slotKey: string,
    nextIcon: CustomDayIconSelection | null,
  ) => {
    const previousIcon = customDayIconsByDate[slotKey] ?? null;

    setCustomDayIconsByDate((previous) => ({
      ...previous,
      [slotKey]: nextIcon,
    }));

    const lastUnderscore = slotKey.lastIndexOf("_");
    const dateKey = slotKey.slice(0, lastUnderscore);
    const slotIndex = Number.parseInt(slotKey.slice(lastUnderscore + 1), 10);

    void persistCustomDayIcon({
      dateKey,
      slotIndex,
      selection: nextIcon,
    }).catch((error) => {
      setCustomDayIconsByDate((previous) => ({
        ...previous,
        [slotKey]: previousIcon,
      }));

      addToast({
        title: "Could not save icon",
        description:
          error instanceof Error
            ? error.message
            : "We couldn't save that custom icon change.",
        color: "danger",
      });
    });
  };

  const handleDrawerNoteChange = (
    dateKey: string,
    drawerKey: DrawerNoteKey,
    nextNotes: string | null,
  ) => {
    const previousNotesForDay =
      drawerNotesByDate[dateKey] ?? EMPTY_DAY_DRAWER_NOTES;

    setDrawerNotesByDate((previous) => ({
      ...previous,
      [dateKey]: {
        ...(previous[dateKey] ?? EMPTY_DAY_DRAWER_NOTES),
        [drawerKey]: nextNotes,
      },
    }));

    void persistDrawerNote({
      dateKey,
      drawerKey,
      notes: nextNotes,
    }).catch((error) => {
      setDrawerNotesByDate((previous) => ({
        ...previous,
        [dateKey]: previousNotesForDay,
      }));

      addToast({
        title: "Could not save notes",
        description:
          error instanceof Error
            ? error.message
            : "We couldn't save those drawer notes.",
        color: "danger",
      });
    });
  };

  const getDrawerNotes = (dateKey: string) =>
    drawerNotesByDate[dateKey] ?? EMPTY_DAY_DRAWER_NOTES;

  const getCustomDayIcon = (date: Date, slotIndex: number) => {
    const dateKey = toDateKey(date);
    const slotKey = `${dateKey}_${slotIndex}`;
    const selection = customDayIconsByDate[slotKey] ?? null;

    if (!selection) {
      return null;
    }

    const option = CUSTOM_DAY_ICON_OPTIONS.find(
      (candidate) => candidate.key === selection.iconKey,
    );

    if (!option) {
      return null;
    }

    return {
      option,
      status: selection.status,
    };
  };

  const getCustomDayIconProgress = (date: Date, iconKey: CustomDayIconKey) => {
    const monthKey = getMonthKey(date);
    const option = CUSTOM_DAY_ICON_OPTIONS.find(
      (candidate) => candidate.key === iconKey,
    );

    if (!option) {
      return 0;
    }

    const completedCount = Object.entries(customDayIconsByDate).reduce(
      (count, [entryDateKey, selection]) => {
        if (
          entryDateKey.startsWith(monthKey) &&
          selection?.iconKey === iconKey &&
          selection.status === "complete"
        ) {
          return count + 1;
        }

        return count;
      },
      0,
    );

    const targetCount =
      option.frequency === "monthly"
        ? 1
        : option.frequency === "biweekly"
          ? 2
          : option.frequency === "weekly"
            ? 4
            : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

    return Math.min(completedCount / targetCount, 1);
  };

  const handleToggleGoalLog = (goalId: string, dateKey: string) => {
    const key = `${goalId}_${dateKey}`;
    const currentlyComplete = goalLogsSnapshot.logsByGoalDate[key] === "complete";

    setGoalLogsSnapshot((prev) => {
      const next = { ...prev, logsByGoalDate: { ...prev.logsByGoalDate } };
      if (currentlyComplete) delete next.logsByGoalDate[key];
      else next.logsByGoalDate[key] = "complete";
      return next;
    });

    void setGoalLog(goalId, dateKey, currentlyComplete ? null : "complete").catch(
      (error) => {
        setGoalLogsSnapshot((prev) => {
          const next = { ...prev, logsByGoalDate: { ...prev.logsByGoalDate } };
          if (currentlyComplete) next.logsByGoalDate[key] = "complete";
          else delete next.logsByGoalDate[key];
          return next;
        });
        addToast({
          title: "Could not save goal",
          description: error instanceof Error ? error.message : undefined,
          color: "danger",
        });
      },
    );
  };

  const handleSaveSalesActivity = async (
    dateKey: string,
    activity: SalesActivityInput,
  ) => {
    const { activity: savedActivity } = await createSalesActivity({
      dateKey,
      activity,
    });

    setSalesByDate((previous) => ({
      ...previous,
      [dateKey]: [savedActivity, ...(previous[dateKey] ?? [])],
    }));
  };

  return (
    <>
      <Table
        aria-label="Month calendar"
        removeWrapper
        shadow="none"
        classNames={{
          base: "h-full overflow-hidden rounded-xl border border-default-300 bg-content1",
          table: "table-fixed w-full",
          th: "bg-default-100/80 text-foreground-500 text-center text-xs font-semibold py-2",
          td: "align-top p-1 h-40",
        }}
      >
        <TableHeader>
          {DAY_NAMES.map((day, dayIndex) => (
            <TableColumn
              key={day}
              className={cn(
                "text-center",
                dayIndex < DAY_NAMES.length - 1 &&
                  "border-r border-default-200",
              )}
            >
              {day}
            </TableColumn>
          ))}
        </TableHeader>

        <TableBody emptyContent={"No days to display"}>
          {weeks.map((week, weekIndex) => (
            <TableRow key={`week-${weekIndex}`}>
              {week.map(({ date, isOutside }, dayIndex) => {
                const dayEntries = entries
                  .filter((entry) => isDateInEntryRange(date, entry))
                  .sort(compareEntries);
                const visibleEntries = dayEntries.slice(0, showCount);
                const hiddenEntries = dayEntries.slice(showCount);
                const isSelected = isSameDay(date, selectedDate);
                const overflowOpen = selectedDayForOverflow
                  ? isSameDay(selectedDayForOverflow, date)
                  : false;

                return (
                  <TableCell
                    key={date.toISOString()}
                    className={cn(
                      "relative cursor-pointer overflow-visible p-2 transition-colors hover:bg-default-100/50",
                      dayIndex < 6 && "border-r border-default-200",
                      weekIndex < weeks.length - 1 &&
                        "border-b border-default-200",
                      isOutside && "bg-content2/15",
                      isSelected && "ring-primary/70 ring-1 ring-inset",
                    )}
                    onClick={() => onSelectDate(date)}
                  >
                    <div className="mb-0.5 flex justify-end">
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          isOutside && "text-foreground-400",
                          isToday(date) &&
                            "bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full",
                        )}
                      >
                        {date.getDate()}
                      </span>
                    </div>

                    <div className="mb-1 grid grid-cols-2 grid-rows-3 gap-1">
                      {goalLogsSnapshot.categories.slice(0, 3).map((cat, catIdx) => {
                        const cellDateKey = toDateKey(date);
                        const completedCount = cat.goals.filter(
                          (g) => goalLogsSnapshot.logsByGoalDate[`${g.id}_${cellDateKey}`] === "complete",
                        ).length;
                        const progress = cat.goals.length > 0 ? completedCount / cat.goals.length : 0;
                        const drawerOpen =
                          activeDrawerCategoryId === cat.id &&
                          activeDrawerDate != null &&
                          isSameDay(activeDrawerDate, date);
                        const isActive = progress > 0 || drawerOpen;
                        const cfg = CATEGORY_FILL_CONFIG[cat.name] ?? DEFAULT_CATEGORY_FILL;

                        return (
                          <button
                            type="button"
                            key={cat.id}
                            title={cat.name}
                            aria-label={cat.name}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (drawerOpen) {
                                setActiveDrawerCategoryId(null);
                                setActiveDrawerDate(null);
                              } else {
                                setActiveDrawerCategoryId(cat.id);
                                setActiveDrawerDate(startOfDay(date));
                                setPrayerDrawerDate(null);
                                setWeightDrawerDate(null);
                                setSalesDrawerDate(null);
                                setIconPickerDate(null);
                              }
                            }}
                            className={cn(
                              "col-start-1 inline-flex h-10 w-10 items-center justify-center rounded-xl border text-[9px] transition-all",
                              ROW_START[catIdx],
                              isActive
                                ? "border-default-300 bg-content1 text-foreground-700 opacity-100"
                                : "border-default-200/40 bg-content1/40 text-foreground-300 opacity-30",
                            )}
                          >
                            <ProgressFillIcon
                              icon={cat.icon || "mdi:circle"}
                              progress={progress}
                              className="h-6 w-6"
                              fillClassName={cfg.fill}
                            />
                          </button>
                        );
                      })}

                      {([0, 1, 2] as const).map((slotIdx) => {
                        const selectedCustomIcon = getCustomDayIcon(
                          date,
                          slotIdx,
                        );
                        const isThisSlotOpen = iconPickerDate
                          ? isSameDay(iconPickerDate, date) &&
                            iconPickerSlot === slotIdx
                          : false;

                        const gridClass =
                          slotIdx === 0
                            ? "col-start-2 row-start-1"
                            : slotIdx === 1
                              ? "col-start-2 row-start-2"
                              : "col-start-2 row-start-3";

                        return (
                          <button
                            type="button"
                            key={`custom-${slotIdx}-${toDateKey(date)}`}
                            title="Monthly goal"
                            aria-label="Monthly goal"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenIconPicker(date, slotIdx);
                            }}
                            className={cn(
                              "inline-flex h-10 w-10 items-center justify-center rounded-xl border text-[9px] transition-all",
                              gridClass,
                              selectedCustomIcon?.status === "complete"
                                ? "border-default-300 bg-content1 text-foreground opacity-100"
                                : selectedCustomIcon?.status === "planned"
                                  ? "border-default-300/70 bg-content1/70 text-foreground-500 opacity-70"
                                  : isThisSlotOpen
                                    ? "border-default-300 bg-content1 text-foreground-700 opacity-100"
                                    : "border-dashed border-default-200/70 bg-content1/40 text-foreground-300 opacity-90",
                            )}
                          >
                            {selectedCustomIcon?.status === "complete" ? (
                              <ProgressFillIcon
                                icon={selectedCustomIcon.option.icon}
                                progress={getCustomDayIconProgress(
                                  date,
                                  selectedCustomIcon.option.key,
                                )}
                                className="h-6 w-6"
                                fillClassName="text-foreground"
                              />
                            ) : (
                              <Icon
                                icon={
                                  selectedCustomIcon?.option.icon ?? "mdi:plus"
                                }
                                className="h-6 w-6"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="space-y-1">
                      {visibleEntries.map((entry) => (
                        <Chip
                          key={`${entry.id}-${date.toISOString()}`}
                          size="sm"
                          variant="flat"
                          className="h-6 w-full max-w-full cursor-pointer justify-start border border-transparent text-xs transition-all hover:border-current"
                          style={
                            {
                              backgroundColor: withAlpha(entry.color, "20"),
                              color: entry.color,
                            } as CSSProperties
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectEntry(entry);
                          }}
                        >
                          <span className="block min-w-0 truncate">
                            {entry.title}
                          </span>
                        </Chip>
                      ))}

                      {hiddenEntries.length > 0 ? (
                        <Popover
                          placement="bottom"
                          showArrow={false}
                          isOpen={overflowOpen}
                          onOpenChange={(open) => {
                            setSelectedDayForOverflow(open ? date : null);
                          }}
                        >
                          <PopoverTrigger>
                            <button
                              type="button"
                              className="text-foreground-500 hover:bg-default-100 rounded-small w-full px-1 py-0.5 text-left text-xs font-medium transition-colors"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              +{hiddenEntries.length} more
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-3">
                            <div className="space-y-2">
                              <p className="text-sm font-semibold">
                                {formatDayLabel(date)}
                              </p>
                              <div className="space-y-1">
                                {hiddenEntries.map((entry) => (
                                  <Chip
                                    key={`${
                                      entry.id
                                    }-overflow-${date.toISOString()}`}
                                    size="sm"
                                    variant="flat"
                                    className="h-6 w-full max-w-full cursor-pointer justify-start border border-transparent text-xs transition-all hover:border-current"
                                    style={
                                      {
                                        backgroundColor: withAlpha(
                                          entry.color,
                                          "20",
                                        ),
                                        color: entry.color,
                                      } as CSSProperties
                                    }
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onSelectEntry(entry);
                                      setSelectedDayForOverflow(null);
                                    }}
                                  >
                                    <span className="block min-w-0 truncate">
                                      {entry.title}
                                    </span>
                                  </Chip>
                                ))}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <CategoryGoalDrawer
        isOpen={activeDrawerCategoryId != null && activeDrawerDate != null}
        date={activeDrawerDate}
        category={
          goalLogsSnapshot.categories.find((c) => c.id === activeDrawerCategoryId) ?? null
        }
        logsByGoalDate={goalLogsSnapshot.logsByGoalDate}
        onToggle={handleToggleGoalLog}
        onClose={() => {
          setActiveDrawerCategoryId(null);
          setActiveDrawerDate(null);
        }}
      />

      <DayIconPickerDrawer
        iconPickerDate={iconPickerDate}
        slotIndex={iconPickerSlot}
        selectedIconsByDate={customDayIconsByDate}
        periodicGoals={goalLogsSnapshot.periodicGoals}
        hiddenGoalKeys={hiddenGoalKeys}
        notes={
          iconPickerDate
            ? (getDrawerNotes(toDateKey(iconPickerDate))[
                `custom_${iconPickerSlot}` as
                  | "custom_0"
                  | "custom_1"
                  | "custom_2"
              ] ?? null)
            : null
        }
        onIconChange={handleCustomDayIconChange}
        onNotesChange={(dateKey, nextNotes) =>
          handleDrawerNoteChange(
            dateKey,
            `custom_${iconPickerSlot}` as "custom_0" | "custom_1" | "custom_2",
            nextNotes,
          )
        }
        onClose={() => {
          setIconPickerDate(null);
        }}
      />
    </>
  );
};

const WeekView = ({
  currentDate,
  selectedDate,
  entries,
  onSelectDate,
  onSelectEntry,
}: {
  currentDate: Date;
  selectedDate: Date;
  entries: NormalizedCalendarEntry[];
  onSelectDate: (date: Date) => void;
  onSelectEntry: (entry: NormalizedCalendarEntry) => void;
}) => {
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[980px] grid-cols-7 gap-3">
        {weekDays.map((date) => {
          const dayEntries = entries
            .filter((entry) => isDateInEntryRange(date, entry))
            .sort(compareEntries);

          return (
            <button
              type="button"
              key={date.toISOString()}
              onClick={() => onSelectDate(date)}
              className={cn(
                "bg-content1 border-divider hover:bg-default-50 min-h-88 min-w-0 rounded-3xl border p-4 text-left transition-colors",
                isSameDay(date, selectedDate) && "ring-primary ring-2",
              )}
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <p className="text-foreground-500 text-xs uppercase tracking-[0.14em]">
                    {DAY_NAMES[date.getDay()]}
                  </p>
                  <p className="mt-1 text-xl font-semibold">{date.getDate()}</p>
                </div>
                {isToday(date) ? (
                  <Chip color="primary" size="sm" variant="flat">
                    Today
                  </Chip>
                ) : null}
              </div>

              <div className="space-y-2">
                {dayEntries.length > 0 ? (
                  dayEntries.map((entry) => (
                    <CategoryPill
                      key={`${entry.id}-${date.toISOString()}`}
                      entry={entry}
                      onPress={() => onSelectEntry(entry)}
                    />
                  ))
                ) : (
                  <div className="text-foreground-500 rounded-2xl border border-dashed border-default-200 px-3 py-8 text-center text-sm">
                    No entries
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const DAY_VIEW_CATEGORY_CONFIG: Record<
  string,
  { label: string; activeBg: string; activeShadow: string; hoverBg: string; hoverText: string; dot: string }
> = {
  // Lowercase keys for legacy DayView, uppercase for DB-driven categories
  spiritual: { label: "Spiritual", activeBg: "bg-teal-500", activeShadow: "shadow-teal-500/30", hoverBg: "hover:bg-teal-500/10", hoverText: "hover:text-teal-500", dot: "bg-teal-500" },
  physical:  { label: "Physical",  activeBg: "bg-[#F59E0C]", activeShadow: "shadow-[#F59E0C]/30", hoverBg: "hover:bg-[#F59E0C]/10", hoverText: "hover:text-[#F59E0C]", dot: "bg-[#F59E0C]" },
  work:      { label: "Work",      activeBg: "bg-purple-500", activeShadow: "shadow-purple-500/30", hoverBg: "hover:bg-purple-500/10", hoverText: "hover:text-purple-500", dot: "bg-purple-500" },
  Spiritual: { label: "Spiritual", activeBg: "bg-teal-500", activeShadow: "shadow-teal-500/30", hoverBg: "hover:bg-teal-500/10", hoverText: "hover:text-teal-500", dot: "bg-teal-500" },
  Physical:  { label: "Physical",  activeBg: "bg-[#F59E0C]", activeShadow: "shadow-[#F59E0C]/30", hoverBg: "hover:bg-[#F59E0C]/10", hoverText: "hover:text-[#F59E0C]", dot: "bg-[#F59E0C]" },
  Work:      { label: "Work",      activeBg: "bg-purple-500", activeShadow: "shadow-purple-500/30", hoverBg: "hover:bg-purple-500/10", hoverText: "hover:text-purple-500", dot: "bg-purple-500" },
};
const DEFAULT_DAY_VIEW_CATEGORY_CONFIG = { label: "", activeBg: "bg-foreground", activeShadow: "shadow-foreground/30", hoverBg: "hover:bg-foreground/10", hoverText: "hover:text-foreground", dot: "bg-foreground-400" };
const GOAL_PRIORITY_STAGES = ["high", "medium", "low"] as const;

type GoalPriorityStage = (typeof GOAL_PRIORITY_STAGES)[number];

const DayView = ({
  currentDate,
  entries,
  onSelectEntry,
  goalLogsCategories = [],
  logsByGoalDate = {},
  notesByGoalDate = {},
  onToggleGoalLog,
  onSaveGoalNote,
  customIconSlots,
  onToggleCustomIconSlot,
}: {
  currentDate: Date;
  entries: NormalizedCalendarEntry[];
  onSelectEntry: (entry: NormalizedCalendarEntry) => void;
  goalLogsCategories?: CategoryWithGoals[];
  logsByGoalDate?: Record<string, "complete">;
  notesByGoalDate?: Record<string, string>;
  onToggleGoalLog?: (goalId: string, dateKey: string) => void;
  onSaveGoalNote?: (goalId: string, dateKey: string, notes: string) => void;
  customIconSlots?: Array<{ slotKey: string; selection: CustomDayIconSelection }>;
  onToggleCustomIconSlot?: (slotKey: string) => void;
}) => {
  const [showCompleted, setShowCompleted] = useState(false);
  const [revealedPriorityByCategory, setRevealedPriorityByCategory] =
    useState<Record<string, GoalPriorityStage>>({});
  const currentDateKey = toDateKey(currentDate);

  const [noteModalGoal, setNoteModalGoal] = useState<{ key: string; label: string; note: string | null } | null>(null);
  const [noteEditorValue, setNoteEditorValue] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);

  const dayEntries = useMemo(
    () =>
      entries
        .filter((entry) => isDateInEntryRange(currentDate, entry))
        .sort(compareEntries),
    [currentDate, entries],
  );

  type GoalItem = {
    key: string;
    label: string;
    icon: string;
    category: string;
    categoryName: string;
    priority: GoalPriorityStage;
    completed: boolean;
    note: string | null;
    onToggle: () => void;
  };

  const allGoalItems = useMemo<GoalItem[]>(
    () =>
      goalLogsCategories.flatMap((cat) =>
        cat.goals.map((goal) => ({
          key: goal.id,
          label: goal.name,
          icon: goal.iconKey || "mdi:circle",
          category: cat.id,
          categoryName: cat.name,
          priority: goal.priority,
          completed: logsByGoalDate[`${goal.id}_${currentDateKey}`] === "complete",
          note: notesByGoalDate[`${goal.id}_${currentDateKey}`] ?? null,
          onToggle: () => onToggleGoalLog?.(goal.id, currentDateKey),
        })),
      ),
    [goalLogsCategories, logsByGoalDate, notesByGoalDate, currentDateKey, onToggleGoalLog],
  );

  const pendingItems = allGoalItems.filter((item) => !item.completed);
  const completedItems = allGoalItems.filter((item) => item.completed);

  const categorySections = useMemo(
    () =>
      goalLogsCategories.flatMap((category) => {
        const items = allGoalItems.filter((item) => item.category === category.id);
        const availablePriorities = GOAL_PRIORITY_STAGES.filter(
          (priority) => items.some((item) => item.priority === priority),
        );
        const defaultPriority = availablePriorities[0];

        if (!defaultPriority) {
          return [];
        }

        const requestedPriority = revealedPriorityByCategory[category.id];
        const currentPriority =
          requestedPriority && availablePriorities.includes(requestedPriority)
            ? requestedPriority
            : defaultPriority;
        const currentPriorityIndex = availablePriorities.indexOf(currentPriority);
        const currentStageItems = items.filter(
          (item) => item.priority === currentPriority,
        );
        const visibleItems = currentStageItems.filter((item) => !item.completed);
        const nextPriority =
          currentPriorityIndex >= 0
            ? availablePriorities[currentPriorityIndex + 1] ?? null
            : null;
        const showNextGoals =
          currentStageItems.length > 0 &&
          visibleItems.length === 0 &&
          nextPriority != null;

        if (visibleItems.length === 0 && !showNextGoals) {
          return [];
        }

        return [
          {
            category,
            config:
              DAY_VIEW_CATEGORY_CONFIG[category.name] ??
              DEFAULT_DAY_VIEW_CATEGORY_CONFIG,
            visibleItems,
            nextPriority,
            showNextGoals,
          },
        ];
      }),
    [allGoalItems, goalLogsCategories, revealedPriorityByCategory],
  );

  const renderIconButton = (
    item: GoalItem,
    size: "normal" | "small" = "normal",
  ) => {
    const cfg = DAY_VIEW_CATEGORY_CONFIG[item.categoryName] ?? DEFAULT_DAY_VIEW_CATEGORY_CONFIG;
    const tooltipLabel = item.completed
      ? item.note ? "Edit note" : "Add note"
      : item.label;
    const handleClick = item.completed
      ? () => {
          setNoteModalGoal({ key: item.key, label: item.label, note: item.note });
          setNoteEditorValue(item.note);
        }
      : item.onToggle;
    return (
      <Tooltip content={tooltipLabel} color="foreground" key={item.key}>
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            "relative flex flex-col items-center justify-center rounded-2xl border transition-all",
            size === "normal" ? "gap-2 p-3" : "gap-1.5 p-2",
            item.completed
              ? `${cfg.activeBg} border-transparent text-white shadow-md ${cfg.activeShadow}`
              : `border-default-200 bg-content2 text-foreground-400 ${cfg.hoverBg} ${cfg.hoverText} hover:border-transparent`,
          )}
        >
          <Icon
            icon={item.completed ? "mdi:check-bold" : item.icon}
            className={size === "normal" ? "h-6 w-6" : "h-5 w-5"}
          />
          {item.completed && item.note && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/70" />
          )}
        </button>
      </Tooltip>
    );
  };

  const handleSaveNote = async () => {
    if (!noteModalGoal) return;
    setIsSavingNote(true);
    try {
      await onSaveGoalNote?.(noteModalGoal.key, currentDateKey, noteEditorValue ?? "");
      setNoteModalGoal(null);
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <>
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="bg-content1 border-divider rounded-3xl border p-5">
        <h2 className="mt-1 text-2xl font-semibold">
          {formatDayLabel(currentDate)}
        </h2>
      </div>

      <div className="bg-content1 border-divider min-h-0 flex-1 overflow-y-auto rounded-3xl border p-5">
        <div className="flex flex-col gap-5">
          {categorySections.map(({ category, config, visibleItems, nextPriority, showNextGoals }) => {
            return (
              <div key={category.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", config.dot)} />
                  <p className="text-xs font-semibold uppercase tracking-widest text-foreground-500">
                    {config.label || category.name}
                  </p>
                </div>
                {visibleItems.length > 0 ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-3">
                    {visibleItems.map((item) => renderIconButton(item))}
                  </div>
                ) : null}
                {showNextGoals ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!nextPriority) return;
                      setRevealedPriorityByCategory((previous) => ({
                        ...previous,
                        [category.id]: nextPriority,
                      }));
                    }}
                    className="mt-3 text-xs font-semibold uppercase tracking-widest text-foreground-400 transition-colors hover:text-foreground-700"
                  >
                    Show next goals
                  </button>
                ) : null}
              </div>
            );
          })}

          {pendingItems.length === 0 && completedItems.length > 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15 text-teal-500">
                <Icon icon="mdi:check-all" className="h-7 w-7" />
              </div>
              <p className="text-sm font-semibold text-foreground">All done!</p>
              <p className="text-xs text-foreground-500">
                All goals completed for today.
              </p>
            </div>
          )}

          {pendingItems.length === 0 && completedItems.length === 0 && (
            <div className="flex items-center justify-center rounded-[20px] border border-dashed border-default-200 py-8 text-sm text-foreground-500">
              No active goals configured.
            </div>
          )}

          {completedItems.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowCompleted((c) => !c)}
                className="flex w-full items-center gap-2 rounded-xl py-2 text-xs font-semibold uppercase tracking-widest text-foreground-400 transition-colors hover:text-foreground-600"
              >
                <Icon
                  icon={
                    showCompleted
                      ? "fa7-solid:chevron-down"
                      : "fa7-solid:chevron-right"
                  }
                  className="h-3 w-3"
                />
                Show completed ({completedItems.length})
              </button>
              {showCompleted && (
                <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2">
                  {completedItems.map((item) =>
                    renderIconButton(item, "small"),
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {customIconSlots && customIconSlots.length > 0 && (
        <div className="bg-content1 border-divider rounded-3xl border p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-foreground-400" />
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground-500">
              Monthly Goals
            </p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-3">
            {customIconSlots.map(({ slotKey, selection }) => {
              const opt = CUSTOM_DAY_ICON_OPTIONS.find(
                (o) => o.key === selection.iconKey,
              );
              if (!opt) return null;
              const isComplete = selection.status === "complete";
              return (
                <Tooltip content={opt.label} color="foreground" key={slotKey}>
                  <button
                    type="button"
                    onClick={() => onToggleCustomIconSlot?.(slotKey)}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-2xl border p-3 transition-all",
                      isComplete
                        ? "border-transparent bg-foreground text-background shadow-md"
                        : "border-default-200 bg-content2 text-foreground-400 hover:border-transparent hover:bg-foreground/10 hover:text-foreground",
                    )}
                  >
                    <Icon
                      icon={isComplete ? "mdi:check-bold" : opt.icon}
                      className="h-6 w-6"
                    />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-content1 border-divider rounded-3xl border p-5">
        {dayEntries.length > 0 ? (
          <div className="space-y-3">
            {dayEntries.map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() => onSelectEntry(entry)}
                className="hover:bg-default-50 flex w-full items-start gap-4 rounded-[20px] border border-default-200 p-4 text-left transition-colors"
              >
                <span
                  className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-base font-semibold">
                      {entry.title}
                    </p>
                    <span className="text-foreground-500 text-xs whitespace-nowrap">
                      {formatEntryTiming(entry)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Chip
                      size="sm"
                      variant="flat"
                      style={
                        {
                          backgroundColor: withAlpha(entry.color, "18"),
                          color: entry.color,
                        } as CSSProperties
                      }
                    >
                      {entry.category.name}
                    </Chip>
                  </div>
                  {entry.notes ? (
                    <p className="text-foreground-500 mt-2 text-sm">
                      {entry.notes}
                    </p>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-foreground-500 flex items-center justify-center rounded-[20px] border border-dashed border-default-200 py-6 text-sm">
            No entries on this day.
          </div>
        )}
      </div>
    </div>

    <Modal
      isOpen={noteModalGoal != null}
      onOpenChange={(open) => { if (!open) setNoteModalGoal(null); }}
      placement="center"
      size="lg"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span className="text-base font-semibold">{noteModalGoal?.label}</span>
          <span className="text-xs font-normal text-foreground-400">{currentDateKey}</span>
        </ModalHeader>
        <ModalBody className="pb-2">
          <RichTextEditor
            value={noteEditorValue}
            onChange={setNoteEditorValue}
            placeholder="Write a note for this goal…"
          />
        </ModalBody>
        <ModalFooter className="flex items-center justify-between">
          <Button
            size="sm"
            variant="light"
            color="danger"
            onPress={() => {
              const item = allGoalItems.find((i) => i.key === noteModalGoal?.key);
              if (item) item.onToggle();
              setNoteModalGoal(null);
            }}
          >
            Mark incomplete
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="flat" onPress={() => setNoteModalGoal(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              color="primary"
              isLoading={isSavingNote}
              onPress={() => void handleSaveNote()}
            >
              Save note
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
    </>
  );
};

const EntryModal = ({
  isOpen,
  onOpenChange,
  draftEntry,
  setDraftEntry,
  existingCategories,
  onSubmit,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  draftEntry: DraftEntry;
  setDraftEntry: React.Dispatch<React.SetStateAction<DraftEntry>>;
  existingCategories: PortableCalendarCategory[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) => (
  <Modal
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    placement="center"
    size="2xl"
  >
    <ModalContent>
      {(onClose) => (
        <form onSubmit={onSubmit}>
          <ModalHeader className="flex flex-col gap-1">Add entry</ModalHeader>
          <ModalBody className="gap-4">
            <Input
              label="Title"
              labelPlacement="outside"
              placeholder="Morning workout"
              value={draftEntry.title}
              onValueChange={(value) =>
                setDraftEntry((prev) => ({ ...prev, title: value }))
              }
              isRequired
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                type="datetime-local"
                label="Start"
                labelPlacement="outside"
                value={draftEntry.start}
                onValueChange={(value) =>
                  setDraftEntry((prev) => ({ ...prev, start: value }))
                }
                isRequired
              />
              <Input
                type="datetime-local"
                label="End"
                labelPlacement="outside"
                value={draftEntry.end}
                onValueChange={(value) =>
                  setDraftEntry((prev) => ({ ...prev, end: value }))
                }
                isRequired
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Input
                label="Category"
                labelPlacement="outside"
                placeholder="Spiritual"
                value={draftEntry.categoryName}
                onValueChange={(value) =>
                  setDraftEntry((prev) => ({ ...prev, categoryName: value }))
                }
              />
              <label className="flex flex-col gap-2">
                <span className="text-foreground text-small">Color</span>
                <input
                  type="color"
                  value={draftEntry.categoryColor}
                  onChange={(event) =>
                    setDraftEntry((prev) => ({
                      ...prev,
                      categoryColor: event.target.value,
                    }))
                  }
                  className="h-10 w-16 cursor-pointer rounded-lg border border-default-200 bg-transparent p-1"
                />
              </label>
            </div>

            {existingCategories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {existingCategories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    onClick={() =>
                      setDraftEntry((prev) => ({
                        ...prev,
                        categoryName: category.name,
                        categoryColor: category.color,
                      }))
                    }
                    className="rounded-full border border-default-200 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-default-100"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            <Textarea
              label="Notes"
              labelPlacement="outside"
              placeholder="Optional notes"
              value={draftEntry.notes}
              onValueChange={(value) =>
                setDraftEntry((prev) => ({ ...prev, notes: value }))
              }
              minRows={3}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Cancel
            </Button>
            <Button color="primary" type="submit">
              Save entry
            </Button>
          </ModalFooter>
        </form>
      )}
    </ModalContent>
  </Modal>
);

export const PortableCalendar = ({
  entries = [],
  initialDate,
  initialCalendarData = null,
  initialView = "month",
  title = "Habit Calendar",
  allowCreate = true,
  onDateSelect,
  onEntrySelect,
  onEntriesChange,
}: PortableCalendarProps) => {
  const resolvedInitialDate = useMemo(
    () => startOfDay(toDate(initialDate)),
    [initialDate],
  );
  const [localEntries, setLocalEntries] = useState(entries);
  const [currentDate, setCurrentDate] = useState(resolvedInitialDate);
  const [selectedDate, setSelectedDate] = useState(resolvedInitialDate);
  const [view, setView] = useState<CalendarView>(initialView);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] =
    useState<Set<string> | null>(null);
  const [monthViewIconsByDate, setMonthViewIconsByDate] = useState<
    Record<string, CustomDayIconSelection | null>
  >(() => initialCalendarData?.currentCustomDayIconsByDate ?? {});
  const [goalsCollapsed, setGoalsCollapsed] = useState(false);
  const [dailyGoalsCollapsed, setDailyGoalsCollapsed] = useState(false);
  const [showLowerPriorityGoals, setShowLowerPriorityGoals] = useState(false);
  const [hiddenGoalKeys, setHiddenGoalKeys] = useState<Set<string>>(
    () => new Set(initialCalendarData?.hiddenKeys ?? []),
  );
  const [goalLogsSnapshot, setGoalLogsSnapshot] = useState<GoalLogsSnapshot>(
    () =>
      initialCalendarData?.currentGoalLogsSnapshot ??
      EMPTY_GOAL_LOGS_SNAPSHOT,
  );
  const [prevMonthGoalLogsByDate, setPrevMonthGoalLogsByDate] = useState<
    Record<string, "complete">
  >(() => initialCalendarData?.prevGoalLogsByDate ?? {});
  const currentMonthKey = useMemo(() => getMonthKey(currentDate), [currentDate]);
  const [loadedBootstrapMonth, setLoadedBootstrapMonth] = useState<
    string | null
  >(() => initialCalendarData?.month ?? null);

  useEffect(() => {
    if (currentMonthKey === loadedBootstrapMonth) {
      return;
    }

    let cancelled = false;

    const loadCalendarBootstrap = async () => {
      try {
        const snapshot = await fetchCalendarBootstrap(currentMonthKey);

        if (cancelled) {
          return;
        }

        setHiddenGoalKeys(new Set(snapshot.hiddenKeys));
        setMonthViewIconsByDate(snapshot.currentCustomDayIconsByDate);
        setGoalLogsSnapshot(snapshot.currentGoalLogsSnapshot);
        setPrevMonthGoalLogsByDate(snapshot.prevGoalLogsByDate);
        setLoadedBootstrapMonth(snapshot.month);
      } catch (error) {
        if (cancelled) {
          return;
        }

        addToast({
          title: "Could not load calendar data",
          description:
            error instanceof Error
              ? error.message
              : "We couldn't load this month's goal data.",
          color: "warning",
        });
      }
    };

    void loadCalendarBootstrap();

    return () => {
      cancelled = true;
    };
  }, [currentMonthKey, loadedBootstrapMonth]);

  const goalMetrics = useMemo(() => {
    const monthKey = getMonthKey(currentDate);
    // Map iconify paths to CUSTOM_DAY_ICON_OPTIONS string keys for completion tracking
    const iconToCustomKey = new Map<string, string>(CUSTOM_DAY_ICON_OPTIONS.map((o) => [o.icon, o.key]));

    return goalLogsSnapshot.periodicGoals.map((pg) => {
      const customKey = iconToCustomKey.get(pg.iconKey) ?? null;
      const targetCount = pg.frequencyGoal ?? 1;
      let completedCount = 0;
      let plannedCount = 0;
      if (customKey) {
        for (const [dateKey, sel] of Object.entries(monthViewIconsByDate)) {
          if (dateKey.startsWith(monthKey) && sel?.iconKey === customKey) {
            if (sel.status === "complete") completedCount++;
            else if (sel.status === "planned") plannedCount++;
          }
        }
      }
      const completedFraction = Math.min(completedCount / targetCount, 1);
      const plannedFraction = Math.min(plannedCount / targetCount, 1 - completedFraction);
      return {
        pg,
        completedCount,
        plannedCount,
        targetCount,
        completedFraction,
        plannedFraction,
        ratio: completedCount / targetCount,
      };
    }).sort((a, b) =>
      a.ratio !== b.ratio ? b.ratio - a.ratio : a.targetCount - b.targetCount,
    );
  }, [monthViewIconsByDate, currentDate, goalLogsSnapshot.periodicGoals]);

  const displayedGoalMetrics = useMemo(
    () =>
      goalMetrics.filter(
        ({ pg }) => showLowerPriorityGoals || pg.priority === "high",
      ),
    [goalMetrics, showLowerPriorityGoals],
  );

  const dailyGoalMetrics = useMemo(() => {
    const last10Days = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - (9 - i));
      return toDateKey(d);
    });
    const allLogs: Record<string, "complete"> = {
      ...prevMonthGoalLogsByDate,
      ...goalLogsSnapshot.logsByGoalDate,
    };
    return goalLogsSnapshot.categories.map((cat) => ({
      category: cat,
      goals: cat.goals.map((goal) => ({
        goal,
        days: last10Days.map((dateKey) => ({
          dateKey,
          done: allLogs[`${goal.id}_${dateKey}`] === "complete",
        })),
      })),
    }));
  }, [currentDate, goalLogsSnapshot, prevMonthGoalLogsByDate]);

  const displayedDailyGoalMetrics = useMemo(
    () =>
      dailyGoalMetrics
        .map(({ category, goals }) => ({
          category,
          goals: goals.filter(
            ({ goal }) => showLowerPriorityGoals || goal.priority === "high",
          ),
        }))
        .filter(({ goals }) => goals.length > 0),
    [dailyGoalMetrics, showLowerPriorityGoals],
  );

  const lowerPrioritySidebarGoals = useMemo(() => {
    const items = [
      ...goalLogsSnapshot.periodicGoals
        .filter((goal) => goal.priority !== "high")
        .map((goal) => ({
          id: goal.id,
          name: goal.name,
          iconKey: goal.iconKey || "mdi:circle",
        })),
      ...goalLogsSnapshot.categories.flatMap((category) =>
        category.goals
          .filter((goal) => goal.priority !== "high")
          .map((goal) => ({
            id: goal.id,
            name: goal.name,
            iconKey: goal.iconKey || "mdi:circle",
          })),
      ),
    ];

    return items.filter(
      (item, index) => items.findIndex((candidate) => candidate.id === item.id) === index,
    );
  }, [goalLogsSnapshot.categories, goalLogsSnapshot.periodicGoals]);

  const handleDayViewToggleGoalLog = (goalId: string, dateKey: string) => {
    const key = `${goalId}_${dateKey}`;
    const currentlyComplete = goalLogsSnapshot.logsByGoalDate[key] === "complete";
    setGoalLogsSnapshot((prev) => {
      const next = { ...prev, logsByGoalDate: { ...prev.logsByGoalDate } };
      if (currentlyComplete) delete next.logsByGoalDate[key];
      else next.logsByGoalDate[key] = "complete";
      return next;
    });
    void setGoalLog(goalId, dateKey, currentlyComplete ? null : "complete").catch(() => {
      setGoalLogsSnapshot((prev) => {
        const next = { ...prev, logsByGoalDate: { ...prev.logsByGoalDate } };
        if (currentlyComplete) next.logsByGoalDate[key] = "complete";
        else delete next.logsByGoalDate[key];
        return next;
      });
      addToast({ title: "Could not save goal", color: "danger" });
    });
  };

  const handleDayViewSaveGoalNote = async (goalId: string, dateKey: string, notes: string) => {
    const key = `${goalId}_${dateKey}`;
    const prev = goalLogsSnapshot.notesByGoalDate[key] ?? null;
    setGoalLogsSnapshot((s) => ({
      ...s,
      notesByGoalDate: notes.trim()
        ? { ...s.notesByGoalDate, [key]: notes }
        : Object.fromEntries(Object.entries(s.notesByGoalDate).filter(([k]) => k !== key)),
    }));
    try {
      await setGoalLogNote(goalId, dateKey, notes);
    } catch {
      setGoalLogsSnapshot((s) => ({
        ...s,
        notesByGoalDate: prev
          ? { ...s.notesByGoalDate, [key]: prev }
          : Object.fromEntries(Object.entries(s.notesByGoalDate).filter(([k]) => k !== key)),
      }));
      addToast({ title: "Could not save note", color: "danger" });
    }
  };

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [draftEntry, setDraftEntry] = useState<DraftEntry>(() => ({
    title: "",
    start: formatDateTimeLocalValue(
      new Date(
        resolvedInitialDate.getFullYear(),
        resolvedInitialDate.getMonth(),
        resolvedInitialDate.getDate(),
        9,
        0,
      ),
    ),
    end: formatDateTimeLocalValue(
      new Date(
        resolvedInitialDate.getFullYear(),
        resolvedInitialDate.getMonth(),
        resolvedInitialDate.getDate(),
        10,
        0,
      ),
    ),
    notes: "",
    categoryName: "",
    categoryColor: DEFAULT_ENTRY_COLOR,
  }));

  const sourceEntries = onEntriesChange ? entries : localEntries;

  const normalizedEntries = useMemo(
    () => sourceEntries.map(normalizeEntry).sort(compareEntries),
    [sourceEntries],
  );

  const categoryFilters = useMemo<CategoryFilter[]>(() => {
    const byId = new Map<string, CategoryFilter>();

    for (const core of CORE_CATEGORIES) {
      byId.set(core.id, { ...core, eventCount: 0 });
    }

    for (const entry of normalizedEntries) {
      const existing = byId.get(entry.category.id);
      byId.set(entry.category.id, {
        id: entry.category.id,
        name: entry.category.name,
        color: entry.category.color,
        eventCount: (existing?.eventCount ?? 0) + 1,
      });
    }

    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [normalizedEntries]);

  const availableCategoryIds = useMemo(
    () => new Set(categoryFilters.map((category) => category.id)),
    [categoryFilters],
  );

  const effectiveSelectedCategoryIds = useMemo(() => {
    if (selectedCategoryIds === null) return null;
    return new Set(
      [...selectedCategoryIds].filter((categoryId) =>
        availableCategoryIds.has(categoryId),
      ),
    );
  }, [availableCategoryIds, selectedCategoryIds]);

  const visibleEntries = useMemo(() => {
    if (effectiveSelectedCategoryIds === null) return normalizedEntries;
    if (effectiveSelectedCategoryIds.size === 0) return [];
    return normalizedEntries.filter((entry) =>
      effectiveSelectedCategoryIds.has(entry.category.id),
    );
  }, [effectiveSelectedCategoryIds, normalizedEntries]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return visibleEntries.filter((entry) => {
      const haystack = `${entry.title} ${entry.notes ?? ""} ${
        entry.category.name
      }`.toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, visibleEntries]);

  const existingCategories = useMemo(
    () =>
      categoryFilters.filter(
        (category) => category.id !== UNCATEGORIZED_CATEGORY.id,
      ),
    [categoryFilters],
  );

  const isCategorySelected = (categoryId: string) =>
    effectiveSelectedCategoryIds === null ||
    effectiveSelectedCategoryIds.has(categoryId);

  const toggleCategorySelection = (categoryId: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(
        prev === null
          ? categoryFilters.map((category) => category.id)
          : [...prev].filter((id) => availableCategoryIds.has(id)),
      );
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const selectAllCategories = () => {
    setSelectedCategoryIds(
      new Set(categoryFilters.map((category) => category.id)),
    );
  };

  const clearCategorySelection = () => {
    setSelectedCategoryIds(new Set());
  };

  const handleSelectDate = (date: Date) => {
    const next = startOfDay(date);
    setCurrentDate(next);
    setSelectedDate(next);
    onDateSelect?.(next);
  };

  const handleSelectEntry = (entry: NormalizedCalendarEntry) => {
    const nextDate = startOfDay(entry.start);
    setCurrentDate(nextDate);
    setSelectedDate(nextDate);
    onEntrySelect?.(entry);
  };

  const navigate = (direction: number) => {
    const next = startOfDay(navigateDate(currentDate, view, direction));
    setCurrentDate(next);
    if (view === "day") setSelectedDate(next);
  };

  const openCreateModal = (date = selectedDate) => {
    const defaultStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      9,
      0,
    );
    const defaultEnd = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      10,
      0,
    );

    const preferredCategory =
      effectiveSelectedCategoryIds && effectiveSelectedCategoryIds.size === 1
        ? categoryFilters.find((category) =>
            effectiveSelectedCategoryIds.has(category.id),
          )
        : undefined;

    setDraftEntry({
      title: "",
      start: formatDateTimeLocalValue(defaultStart),
      end: formatDateTimeLocalValue(defaultEnd),
      notes: "",
      categoryName:
        preferredCategory?.id === UNCATEGORIZED_CATEGORY.id
          ? ""
          : (preferredCategory?.name ?? ""),
      categoryColor: preferredCategory?.color ?? DEFAULT_ENTRY_COLOR,
    });

    onOpen();
  };

  const commitEntries = (nextEntries: PortableCalendarEntry[]) => {
    if (!onEntriesChange) setLocalEntries(nextEntries);
    onEntriesChange?.(nextEntries);
  };

  const handleCreateEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitle = draftEntry.title.trim();
    if (!trimmedTitle) return;

    const start = toDate(draftEntry.start);
    const rawEnd = toDate(draftEntry.end);
    const end = rawEnd.getTime() >= start.getTime() ? rawEnd : start;
    const trimmedCategory = draftEntry.categoryName.trim();

    const matchingCategory = existingCategories.find(
      (category) =>
        category.name.toLowerCase() === trimmedCategory.toLowerCase(),
    );

    const nextEntry: PortableCalendarEntry = {
      id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmedTitle,
      start,
      end,
      notes: draftEntry.notes.trim() || undefined,
      color: draftEntry.categoryColor,
      category: trimmedCategory
        ? (matchingCategory ?? {
            id: slugify(trimmedCategory) || `category-${Date.now()}`,
            name: trimmedCategory,
            color: draftEntry.categoryColor,
          })
        : null,
    };

    const nextEntries = [...sourceEntries, nextEntry];
    commitEntries(nextEntries);
    handleSelectDate(start);
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          navigate(-1);
          break;
        case "ArrowRight":
          event.preventDefault();
          navigate(1);
          break;
        case "Home":
          event.preventDefault();
          handleSelectDate(new Date());
          break;
        case "n":
          if ((event.metaKey || event.ctrlKey) && allowCreate) {
            event.preventDefault();
            openCreateModal();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allowCreate, navigate, handleSelectDate, openCreateModal]);

  return (
    <>
      <div className="flex h-full w-full flex-col rounded-2xl border border-default-200 bg-default-100/80 p-1 shadow-sm">
        <Card className="mx-0 my-0 h-full min-h-0 w-full flex-1 overflow-hidden rounded-[18px] border-default-200 bg-default-50">
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside
              className={cn(
                "border-divider bg-content1/70 flex w-full flex-col border-b transition-all duration-200 lg:shrink-0 lg:border-r lg:border-b-0",
                isSidebarCollapsed
                  ? "items-center p-2 lg:w-14"
                  : "p-3 lg:w-[250px]",
              )}
            >
              {isSidebarCollapsed ? (
                <>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={() => setIsSidebarCollapsed(false)}
                    title="Show sidebar"
                    className="h-8 w-8"
                  >
                    <ChevronRightIcon />
                  </Button>

                  <div className="mt-4 flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto" />
                </>
              ) : (
                <>
                  <div className="flex items-start justify-end px-1 pt-1">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={() => setIsSidebarCollapsed(true)}
                      title="Hide sidebar"
                    >
                      <ChevronLeftIcon />
                    </Button>
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setGoalsCollapsed((v) => !v)}
                      className="flex w-full items-center gap-1 text-left"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-400">
                        Monthly Goal Progress
                      </span>
                      <Icon
                        icon={
                          goalsCollapsed
                            ? "mdi:chevron-right"
                            : "mdi:chevron-down"
                        }
                        className="ml-auto h-3.5 w-3.5 text-foreground-400"
                      />
                    </button>
                    {!goalsCollapsed && (
                      <div className="mt-2 space-y-1.5">
                        {displayedGoalMetrics.map(({ pg, completedCount, targetCount, completedFraction, plannedFraction }) => (
                          <div key={pg.id} className="flex items-center gap-2">
                            <Tooltip
                              content={pg.name}
                              placement="right"
                              size="sm"
                              color="foreground"
                            >
                              <span className="shrink-0">
                                <Icon
                                  icon={pg.iconKey || "mdi:circle"}
                                  className="h-4 w-4 text-foreground-500"
                                />
                              </span>
                            </Tooltip>
                            <div className="min-w-0 flex-1">
                              <div className="flex h-2 overflow-hidden rounded-full bg-default-200">
                                <div
                                  className="h-full bg-foreground transition-all"
                                  style={{ width: `${completedFraction * 100}%` }}
                                />
                                <div
                                  className="h-full transition-all"
                                  style={{
                                    width: `${plannedFraction * 100}%`,
                                    backgroundImage:
                                      "repeating-linear-gradient(45deg, hsl(var(--heroui-foreground)) 0px, hsl(var(--heroui-foreground)) 2px, transparent 2px, transparent 5px)",
                                  }}
                                />
                              </div>
                            </div>
                            <span className="shrink-0 text-[10px] tabular-nums text-foreground-400">
                              {completedCount}/{targetCount}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setDailyGoalsCollapsed((v) => !v)}
                      className="flex w-full items-center gap-1 text-left"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-400">
                        {formatMonthYear(currentDate)} Daily Goals
                      </span>
                      <Icon
                        icon={
                          dailyGoalsCollapsed
                            ? "mdi:chevron-right"
                            : "mdi:chevron-down"
                        }
                        className="ml-auto h-3.5 w-3.5 text-foreground-400"
                      />
                    </button>
                    {!dailyGoalsCollapsed && (
                      <div className="mt-2 space-y-3">
                        {displayedDailyGoalMetrics.map(({ category, goals }) => {
                          if (goals.length === 0) return null;
                          const cfg = CATEGORY_FILL_CONFIG[category.name] ?? DEFAULT_CATEGORY_FILL;
                          return (
                            <div key={category.id}>
                              <p
                                className={`mb-1 text-[9px] font-bold uppercase tracking-widest ${cfg.label}`}
                              >
                                {category.name}
                              </p>
                              <div className="space-y-1.5">
                                {goals.map(({ goal, days }) => (
                                  <div
                                    key={goal.id}
                                    className="flex items-center gap-2"
                                  >
                                    <Tooltip
                                      content={goal.name}
                                      placement="right"
                                      size="sm"
                                      color="foreground"
                                    >
                                      <span className="shrink-0">
                                        <Icon
                                          icon={goal.iconKey || "mdi:circle"}
                                          className="h-4 w-4 text-foreground-500"
                                        />
                                      </span>
                                    </Tooltip>
                                    <div className="flex min-w-0 flex-1 gap-0.5">
                                      {days.map(({ dateKey, done }) => (
                                        <div
                                          key={dateKey}
                                          className={`h-3 flex-1 rounded-[3px] ${done ? cfg.bar : "bg-default-200"}`}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {lowerPrioritySidebarGoals.length > 0 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setShowLowerPriorityGoals((previous) => !previous)
                        }
                        className="flex w-full items-center gap-1 text-left"
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-400">
                          {showLowerPriorityGoals
                            ? "Hide Lower Priority Goals"
                            : "Show Lower Priority Goals"}
                        </span>
                        <Icon
                          icon={
                            showLowerPriorityGoals
                              ? "mdi:chevron-right"
                              : "mdi:chevron-down"
                          }
                          className="ml-auto h-3.5 w-3.5 text-foreground-400"
                        />
                      </button>
                      {!showLowerPriorityGoals && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {lowerPrioritySidebarGoals.map((goal) => (
                            <Tooltip
                              key={goal.id}
                              content={goal.name}
                              placement="right"
                              size="sm"
                              color="foreground"
                            >
                              <span>
                                <Icon
                                  icon={goal.iconKey}
                                  className="h-4 w-4 text-foreground-400"
                                />
                              </span>
                            </Tooltip>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-content1/40">
              <CardHeader className="flex flex-col items-start justify-between gap-3 border-b border-default-200 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                  <Tabs
                    radius="md"
                    size="sm"
                    selectedKey={view}
                    onSelectionChange={(key) => setView(key as CalendarView)}
                    classNames={{
                      tabList: "bg-default-100/80 rounded-lg p-0.5",
                      cursor: "rounded-md shadow-sm",
                    }}
                  >
                    <Tab key="day" title="Day" />
                    <Tab key="week" title="Week" />
                    <Tab key="month" title="Month" />
                  </Tabs>

                  <p className="text-foreground-500 text-xs">
                    {titleForView(view, currentDate)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isSearchExpanded ? (
                    <div className="relative">
                      <Input
                        size="sm"
                        placeholder="Search entries..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        startContent={<SearchIcon />}
                        endContent={
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            onPress={() => {
                              setIsSearchExpanded(false);
                              setSearchQuery("");
                            }}
                          >
                            <CloseIcon />
                          </Button>
                        }
                        className="w-52"
                        autoFocus
                      />

                      {searchQuery.length > 0 ? (
                        <div className="bg-content1 shadow-medium rounded-2xl border-divider absolute top-full right-0 z-50 mt-2 w-80 border p-2">
                          {filteredEntries.length > 0 ? (
                            <div className="space-y-1">
                              {filteredEntries.slice(0, 8).map((entry) => (
                                <button
                                  type="button"
                                  key={entry.id}
                                  onClick={() => {
                                    handleSelectEntry(entry);
                                    setIsSearchExpanded(false);
                                    setSearchQuery("");
                                  }}
                                  className="hover:bg-default-100 w-full rounded-xl p-2 text-left transition-colors"
                                >
                                  <CategoryPill
                                    entry={entry}
                                    onPress={() => handleSelectEntry(entry)}
                                    compact
                                  />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="text-foreground-500 p-3 text-sm">
                              No matching entries.
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="bordered"
                      radius="md"
                      onPress={() => setIsSearchExpanded(true)}
                      title="Search entries"
                    >
                      <SearchIcon />
                    </Button>
                  )}

                  <Button
                    isIconOnly
                    size="sm"
                    variant="bordered"
                    radius="md"
                    onPress={() => navigate(-1)}
                    title={`Previous ${view}`}
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
                    onPress={() => handleSelectDate(new Date())}
                    title="Go to today"
                  >
                    Today
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="bordered"
                    radius="md"
                    onPress={() => navigate(1)}
                    title={`Next ${view}`}
                  >
                    <ChevronRightIcon />
                  </Button>

                  {allowCreate ? (
                    <Button
                      size="sm"
                      variant="flat"
                      startContent={<PlusIcon />}
                      onPress={() => openCreateModal()}
                    >
                      Add Entry
                    </Button>
                  ) : null}
                </div>
              </CardHeader>

              <CardBody className="min-h-0 flex-1 p-3 sm:p-4">
                <div className="flex min-h-0 flex-1 flex-col">
                  {view === "month" ? (
                    <MonthView
                      currentDate={currentDate}
                      selectedDate={selectedDate}
                      entries={visibleEntries}
                      onSelectDate={handleSelectDate}
                      onSelectEntry={handleSelectEntry}
                      hiddenGoalKeys={hiddenGoalKeys}
                      onCustomDayIconsByDateChange={setMonthViewIconsByDate}
                      onGoalLogsSnapshotChange={setGoalLogsSnapshot}
                    />
                  ) : view === "week" ? (
                    <WeekView
                      currentDate={currentDate}
                      selectedDate={selectedDate}
                      entries={visibleEntries}
                      onSelectDate={handleSelectDate}
                      onSelectEntry={handleSelectEntry}
                    />
                  ) : (
                    <DayView
                      key={toDateKey(currentDate)}
                      currentDate={currentDate}
                      entries={visibleEntries}
                      onSelectEntry={handleSelectEntry}
                      goalLogsCategories={goalLogsSnapshot.categories}
                      logsByGoalDate={goalLogsSnapshot.logsByGoalDate}
                      notesByGoalDate={goalLogsSnapshot.notesByGoalDate}
                      onToggleGoalLog={handleDayViewToggleGoalLog}
                      onSaveGoalNote={handleDayViewSaveGoalNote}
                    />
                  )}
                </div>
              </CardBody>
            </div>
          </div>
        </Card>
      </div>

      {allowCreate ? (
        <EntryModal
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          draftEntry={draftEntry}
          setDraftEntry={setDraftEntry}
          existingCategories={existingCategories}
          onSubmit={handleCreateEntry}
        />
      ) : null}
    </>
  );
};

export function MonthCalendar({
  initialDate,
  initialCalendarData,
}: Pick<PortableCalendarProps, "initialDate" | "initialCalendarData">) {
  return (
    <PortableCalendar
      title="Habit Calendar"
      initialView="day"
      initialDate={initialDate}
      initialCalendarData={initialCalendarData}
    />
  );
}
