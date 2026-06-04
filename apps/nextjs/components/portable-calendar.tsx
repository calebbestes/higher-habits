"use client";

import { fetchCalendarBootstrap } from "@/lib/calendar-bootstrap-client";
import type { CalendarBootstrapData } from "@/lib/calendar-bootstrap-types";
import {
  type CalendarSettingsData,
  DEFAULT_CALENDAR_SETTINGS,
  fetchCalendarSettings,
  saveCalendarSettings,
} from "@/lib/calendar-settings-client";
import {
  type CategoryWithGoals,
  EMPTY_GOAL_LOGS_SNAPSHOT,
  type GoalLogsSnapshot,
  type PeriodicGoalInfo,
  fetchGoalLogsSnapshot,
  setGoalLog,
  setGoalLogNote,
} from "@/lib/goal-logs-client";
import {
  type CalendarHabitKey,
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
  persistCustomDayIcon,
  persistDayHabit,
  persistDrawerNote,
  persistPrayerChecklist,
  persistSalesChecklist,
  persistWeightChecklist,
} from "@/lib/habit-state-client";
import {
  type Task,
  fetchTasks,
  getTaskImportanceScore,
  getTaskPriorityLevel,
  getTaskUrgency,
  getTaskUrgencyScore,
  todayDateKey,
  updateTask,
} from "@/lib/tasks-client";
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
  Select,
  SelectItem,
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
import { CategoryGoalDrawer } from "./category-goal-drawer";
import { DayIconPickerDrawer } from "./day-icon-picker-drawer";
import { PRAYER_CHECKLIST_ITEMS } from "./prayer-checklist-drawer";
import { RichTextEditor } from "./rich-text-editor";
import { WEIGHT_CHECKLIST_ITEMS } from "./weight-checklist-drawer";

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
  initialDashboardOpen?: boolean;
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

const CATEGORY_FILL_CONFIG: Record<
  string,
  { fill: string; bar: string; label: string }
> = {
  Spiritual: {
    fill: "text-teal-600",
    bar: "bg-teal-500",
    label: "text-teal-600",
  },
  Physical: {
    fill: "text-[#F59E0C]",
    bar: "bg-[#F59E0C]",
    label: "text-[#F59E0C]",
  },
  Work: {
    fill: "text-purple-600",
    bar: "bg-purple-600",
    label: "text-purple-600",
  },
};
const DEFAULT_CATEGORY_FILL = {
  fill: "text-foreground-600",
  bar: "bg-foreground-400",
  label: "text-foreground-500",
};

const COMPLETE_SHARE_TILE = "🟩";
const EMPTY_SHARE_TILE = "⬜";
const MOBILE_SIDEBAR_MEDIA_QUERY = "(max-width: 1023px)";

type DailyGoalMetric = {
  category: CategoryWithGoals;
  goals: Array<{
    goal: CategoryWithGoals["goals"][number];
    days: Array<{ dateKey: string; done: boolean }>;
  }>;
};

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

const taskToInput = (task: Task) => ({
  name: task.name,
  importance: task.importance,
  dueDate: task.dueDate,
  completedAt: task.completedAt,
  timeRequired: task.timeRequired,
});

const compareTasksByPriority = (a: Task, b: Task, today: string) => {
  const priorityCompare =
    getTaskPriorityLevel(b, today) - getTaskPriorityLevel(a, today);

  if (priorityCompare !== 0) {
    return priorityCompare;
  }

  const importanceCompare =
    getTaskImportanceScore(b.importance) - getTaskImportanceScore(a.importance);

  if (importanceCompare !== 0) {
    return importanceCompare;
  }

  const urgencyCompare =
    getTaskUrgencyScore(getTaskUrgency(b, today)) -
    getTaskUrgencyScore(getTaskUrgency(a, today));

  if (urgencyCompare !== 0) {
    return urgencyCompare;
  }

  const aDueDate = a.dueDate ?? "9999-99-99";
  const bDueDate = b.dueDate ?? "9999-99-99";
  const dueDateCompare = aDueDate < bDueDate ? -1 : aDueDate > bDueDate ? 1 : 0;

  if (dueDateCompare !== 0) {
    return dueDateCompare;
  }

  const createdCompare = b.createdAt.localeCompare(a.createdAt);

  if (createdCompare !== 0) {
    return createdCompare;
  }

  return a.name.localeCompare(b.name);
};

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

const formatShareTitleDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);

const dateFromDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatShareDateKey = (dateKey: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(dateFromDateKey(dateKey));

const buildHabitShareText = ({
  title,
  currentDate,
  dailyGoalMetrics,
}: {
  title: string;
  currentDate: Date;
  dailyGoalMetrics: DailyGoalMetric[];
}) => {
  const currentDateKey = toDateKey(currentDate);
  const rows = dailyGoalMetrics.flatMap(({ category, goals }) =>
    goals.map(({ goal, days }) => ({
      categoryName: category.name,
      goalName: goal.name,
      cells: days
        .map(({ done }) => (done ? COMPLETE_SHARE_TILE : EMPTY_SHARE_TILE))
        .join(""),
      completedToday:
        days.find((day) => day.dateKey === currentDateKey)?.done ?? false,
    })),
  );

  if (rows.length === 0) {
    return "";
  }

  const firstDays = dailyGoalMetrics[0]?.goals[0]?.days ?? [];
  const firstDateKey = firstDays[0]?.dateKey;
  const lastDateKey = firstDays.at(-1)?.dateKey;
  const rangeLabel =
    firstDateKey && lastDateKey
      ? `Last ${firstDays.length} days (${formatShareDateKey(
          firstDateKey,
        )} - ${formatShareDateKey(lastDateKey)})`
      : "Last 10 days";
  const completedToday = rows.filter((row) => row.completedToday).length;
  const lines = [
    `${title} ${formatShareTitleDate(currentDate)} ${completedToday}/${rows.length}`,
    rangeLabel,
    "",
  ];
  let previousCategoryName: string | null = null;

  for (const row of rows) {
    if (row.categoryName !== previousCategoryName) {
      if (previousCategoryName !== null) {
        lines.push("");
      }
      lines.push(row.categoryName);
      previousCategoryName = row.categoryName;
    }

    lines.push(`${row.cells} ${row.goalName}`);
  }

  return lines.join("\n");
};

const buildDailyGoalMetricsForDate = ({
  currentDate,
  categories,
  logsByGoalDate,
}: {
  currentDate: Date;
  categories: CategoryWithGoals[];
  logsByGoalDate: Record<string, "complete" | "planned">;
}): DailyGoalMetric[] => {
  const last10Days = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - (9 - i));
    return toDateKey(d);
  });

  return categories.map((cat) => ({
    category: cat,
    goals: cat.goals.map((goal) => ({
      goal,
      days: last10Days.map((dateKey) => ({
        dateKey,
        done: logsByGoalDate[`${goal.id}_${dateKey}`] === "complete",
      })),
    })),
  }));
};

const filterDailyGoalMetricsByPriority = (
  dailyGoalMetrics: DailyGoalMetric[],
  includeLowerPriority: boolean,
) =>
  dailyGoalMetrics
    .map(({ category, goals }) => ({
      category,
      goals: goals.filter(
        ({ goal }) => includeLowerPriority || goal.priority === "high",
      ),
    }))
    .filter(({ goals }) => goals.length > 0);

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
  onShareHabitResults,
  monthlyGoalSlots = 3,
  visibleCategoryIds = [],
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
  onShareHabitResults?: (date: Date) => void;
  monthlyGoalSlots?: number;
  visibleCategoryIds?: string[];
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
  const [goalLogsSnapshot, setGoalLogsSnapshot] = useState<GoalLogsSnapshot>(
    EMPTY_GOAL_LOGS_SNAPSHOT,
  );
  useEffect(() => {
    onGoalLogsSnapshotChange?.(goalLogsSnapshot);
  }, [goalLogsSnapshot, onGoalLogsSnapshotChange]);
  const [activeDrawerCategoryId, setActiveDrawerCategoryId] = useState<
    string | null
  >(null);
  const [activeDrawerDate, setActiveDrawerDate] = useState<Date | null>(null);

  const [prayerDrawerDate, setPrayerDrawerDate] = useState<Date | null>(null);
  const [weightDrawerDate, setWeightDrawerDate] = useState<Date | null>(null);
  const [salesDrawerDate, setSalesDrawerDate] = useState<Date | null>(null);
  const [iconPickerDate, setIconPickerDate] = useState<Date | null>(null);
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
        const [goalsSnap, prevGoalsSnap] = await Promise.all([
          fetchGoalLogsSnapshot(currentMonthKey),
          fetchGoalLogsSnapshot(prevMonthKey),
        ]);

        if (cancelled) {
          return;
        }

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
          title: "Could not load goal data",
          description:
            error instanceof Error
              ? error.message
              : "We couldn't load this month's goal data.",
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

  const handleOpenMonthlyGoalPicker = (date: Date) => {
    setIconPickerDate(startOfDay(date));
    setActiveDrawerCategoryId(null);
    setActiveDrawerDate(null);
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

  const handleToggleGoalLog = (goalId: string, dateKey: string) => {
    const key = `${goalId}_${dateKey}`;
    const currentStatus = goalLogsSnapshot.logsByGoalDate[key];
    // null → planned → complete → null
    const nextStatus =
      currentStatus === "complete"
        ? null
        : currentStatus === "planned"
          ? "complete"
          : "planned";
    const prevStatus = currentStatus ?? null;

    setGoalLogsSnapshot((prev) => {
      const next = { ...prev, logsByGoalDate: { ...prev.logsByGoalDate } };
      if (nextStatus) next.logsByGoalDate[key] = nextStatus;
      else delete next.logsByGoalDate[key];
      return next;
    });

    void setGoalLog(goalId, dateKey, nextStatus).catch((error) => {
      setGoalLogsSnapshot((prev) => {
        const next = { ...prev, logsByGoalDate: { ...prev.logsByGoalDate } };
        if (prevStatus) next.logsByGoalDate[key] = prevStatus;
        else delete next.logsByGoalDate[key];
        return next;
      });
      addToast({
        title: "Could not save goal",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    });
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
            // biome-ignore lint/suspicious/noArrayIndexKey: week rows have no stable identity
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

                    {(() => {
                      const cellDateKey = toDateKey(date);
                      const categories = goalLogsSnapshot.categories.filter(
                        (c) =>
                          c.goals.length > 0 &&
                          (visibleCategoryIds.length === 0 ||
                            visibleCategoryIds.includes(c.id)),
                      );
                      if (categories.length === 0) return null;
                      const anyProgress = categories.some((c) =>
                        c.goals.some(
                          (g) =>
                            goalLogsSnapshot.logsByGoalDate[
                              `${g.id}_${cellDateKey}`
                            ] === "complete",
                        ),
                      );
                      const svgSize = 52;
                      const center = svgSize / 2;
                      const strokeWidth = 3.5;
                      const gap = 2.5;
                      const step = strokeWidth + gap;
                      const outerR = center - 2 - strokeWidth / 2;
                      const loggedForDay = goalLogsSnapshot.periodicGoals
                        .map((g) => ({
                          ...g,
                          status:
                            goalLogsSnapshot.logsByGoalDate[
                              `${g.id}_${cellDateKey}`
                            ],
                        }))
                        .filter(
                          (g) =>
                            g.status === "complete" || g.status === "planned",
                        );
                      return (
                        <div className="mb-1 flex flex-col gap-2">
                          {anyProgress && (
                            <div className="flex justify-center">
                              <div className="group relative inline-flex">
                                <svg
                                  width={svgSize}
                                  height={svgSize}
                                  viewBox={`0 0 ${svgSize} ${svgSize}`}
                                  role="img"
                                >
                                  <title>Day progress</title>
                                  {categories.map((cat, i) => {
                                    const completedCount = cat.goals.filter(
                                      (g) =>
                                        goalLogsSnapshot.logsByGoalDate[
                                          `${g.id}_${cellDateKey}`
                                        ] === "complete",
                                    ).length;
                                    const progress =
                                      cat.goals.length > 0
                                        ? completedCount / cat.goals.length
                                        : 0;
                                    const cfg =
                                      DAY_VIEW_CATEGORY_CONFIG[cat.name] ??
                                      DEFAULT_DAY_VIEW_CATEGORY_CONFIG;
                                    const r = outerR - i * step;
                                    const circ = 2 * Math.PI * r;
                                    const offset = circ * (1 - progress);
                                    return (
                                      <g key={cat.id}>
                                        <circle
                                          cx={center}
                                          cy={center}
                                          r={r}
                                          fill="none"
                                          stroke={cfg.color}
                                          strokeOpacity={0.15}
                                          strokeWidth={strokeWidth}
                                        />
                                        <circle
                                          cx={center}
                                          cy={center}
                                          r={r}
                                          fill="none"
                                          stroke={cfg.color}
                                          strokeWidth={strokeWidth}
                                          strokeLinecap="round"
                                          strokeDasharray={circ}
                                          strokeDashoffset={offset}
                                          style={{
                                            transform: "rotate(-90deg)",
                                            transformOrigin: `${center}px ${center}px`,
                                          }}
                                        />
                                      </g>
                                    );
                                  })}
                                </svg>
                                {onShareHabitResults ? (
                                  <Tooltip
                                    content="Share habit results"
                                    placement="top"
                                    size="sm"
                                    color="foreground"
                                  >
                                    <Button
                                      isIconOnly
                                      size="sm"
                                      variant="flat"
                                      radius="full"
                                      aria-label="Share habit results"
                                      title="Share habit results"
                                      className="absolute -top-2 -right-2 z-10 h-7 w-7 min-w-7 bg-content1/90 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                      onPress={() => onShareHabitResults(date)}
                                    >
                                      <Icon
                                        icon="mdi:share-variant-outline"
                                        className="h-3.5 w-3.5"
                                      />
                                    </Button>
                                  </Tooltip>
                                ) : null}
                              </div>
                            </div>
                          )}
                          <div className="flex justify-center gap-1">
                            {Array.from(
                              {
                                length: Math.min(
                                  loggedForDay.length + 1,
                                  monthlyGoalSlots,
                                ),
                              },
                              (_, i) => i,
                            ).map((slotIdx) => {
                              const goalForSlot = loggedForDay[slotIdx];
                              const isComplete =
                                goalForSlot?.status === "complete";
                              const isPlanned =
                                goalForSlot?.status === "planned";
                              return (
                                <button
                                  type="button"
                                  key={`periodic-${slotIdx}-${cellDateKey}`}
                                  title={goalForSlot?.name ?? "Monthly goal"}
                                  aria-label={
                                    goalForSlot?.name ?? "Monthly goal"
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenMonthlyGoalPicker(date);
                                  }}
                                  className={cn(
                                    "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                                    isComplete
                                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-600"
                                      : isPlanned
                                        ? "border-default-300 bg-content2 text-foreground-400"
                                        : "border-dashed border-default-200/70 bg-content1/40 text-foreground-300 opacity-90",
                                  )}
                                >
                                  <Icon
                                    icon={goalForSlot?.iconKey ?? "mdi:plus"}
                                    className="h-5 w-5"
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

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
          goalLogsSnapshot.categories.find(
            (c) => c.id === activeDrawerCategoryId,
          ) ?? null
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
        categories={goalLogsSnapshot.categories}
        periodicGoals={goalLogsSnapshot.periodicGoals}
        logsByGoalDate={goalLogsSnapshot.logsByGoalDate}
        onToggleGoal={handleToggleGoalLog}
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
  {
    label: string;
    activeBg: string;
    activeShadow: string;
    hoverBg: string;
    hoverText: string;
    dot: string;
    inactiveBorder: string;
    iconColor: string;
    color: string;
  }
> = {
  // Lowercase keys for legacy DayView, uppercase for DB-driven categories
  spiritual: {
    label: "Spiritual",
    activeBg: "bg-teal-500",
    activeShadow: "shadow-teal-500/30",
    hoverBg: "hover:bg-teal-500/10",
    hoverText: "hover:text-teal-500",
    dot: "bg-teal-500",
    inactiveBorder: "border-teal-500/40",
    iconColor: "text-teal-500",
    color: "#14b8a6",
  },
  physical: {
    label: "Physical",
    activeBg: "bg-[#F59E0C]",
    activeShadow: "shadow-[#F59E0C]/30",
    hoverBg: "hover:bg-[#F59E0C]/10",
    hoverText: "hover:text-[#F59E0C]",
    dot: "bg-[#F59E0C]",
    inactiveBorder: "border-[#F59E0C]/40",
    iconColor: "text-[#F59E0C]",
    color: "#F59E0C",
  },
  work: {
    label: "Work",
    activeBg: "bg-purple-500",
    activeShadow: "shadow-purple-500/30",
    hoverBg: "hover:bg-purple-500/10",
    hoverText: "hover:text-purple-500",
    dot: "bg-purple-500",
    inactiveBorder: "border-purple-500/40",
    iconColor: "text-purple-500",
    color: "#a855f7",
  },
  Spiritual: {
    label: "Spiritual",
    activeBg: "bg-teal-500",
    activeShadow: "shadow-teal-500/30",
    hoverBg: "hover:bg-teal-500/10",
    hoverText: "hover:text-teal-500",
    dot: "bg-teal-500",
    inactiveBorder: "border-teal-500/40",
    iconColor: "text-teal-500",
    color: "#14b8a6",
  },
  Physical: {
    label: "Physical",
    activeBg: "bg-[#F59E0C]",
    activeShadow: "shadow-[#F59E0C]/30",
    hoverBg: "hover:bg-[#F59E0C]/10",
    hoverText: "hover:text-[#F59E0C]",
    dot: "bg-[#F59E0C]",
    inactiveBorder: "border-[#F59E0C]/40",
    iconColor: "text-[#F59E0C]",
    color: "#F59E0C",
  },
  Work: {
    label: "Work",
    activeBg: "bg-purple-500",
    activeShadow: "shadow-purple-500/30",
    hoverBg: "hover:bg-purple-500/10",
    hoverText: "hover:text-purple-500",
    dot: "bg-purple-500",
    inactiveBorder: "border-purple-500/40",
    iconColor: "text-purple-500",
    color: "#a855f7",
  },
};
const DEFAULT_DAY_VIEW_CATEGORY_CONFIG = {
  label: "",
  activeBg: "bg-foreground",
  activeShadow: "shadow-foreground/30",
  hoverBg: "hover:bg-foreground/10",
  hoverText: "hover:text-foreground",
  dot: "bg-foreground-400",
  inactiveBorder: "border-foreground/40",
  iconColor: "text-foreground",
  color: "#888888",
};
const GOAL_PRIORITY_STAGES = ["high", "medium", "low"] as const;

type GoalPriorityStage = (typeof GOAL_PRIORITY_STAGES)[number];

const PRIORITY_POINTS: Record<GoalPriorityStage, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const DayView = ({
  currentDate,
  entries,
  onSelectEntry,
  goalLogsCategories = [],
  periodicGoals = [],
  logsByGoalDate = {},
  notesByGoalDate = {},
  onToggleGoalLog,
  onSaveGoalNote,
  onShareHabitResults,
}: {
  currentDate: Date;
  entries: NormalizedCalendarEntry[];
  onSelectEntry: (entry: NormalizedCalendarEntry) => void;
  goalLogsCategories?: CategoryWithGoals[];
  periodicGoals?: PeriodicGoalInfo[];
  logsByGoalDate?: Record<string, "complete" | "planned">;
  notesByGoalDate?: Record<string, string>;
  onToggleGoalLog?: (goalId: string, dateKey: string) => void;
  onSaveGoalNote?: (goalId: string, dateKey: string, notes: string) => void;
  onShareHabitResults?: () => void;
}) => {
  const [showCompleted, setShowCompleted] = useState(false);

  const currentDateKey = toDateKey(currentDate);

  const [noteModalGoal, setNoteModalGoal] = useState<{
    key: string;
    label: string;
    note: string | null;
  } | null>(null);
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
          completed:
            logsByGoalDate[`${goal.id}_${currentDateKey}`] === "complete",
          note: notesByGoalDate[`${goal.id}_${currentDateKey}`] ?? null,
          onToggle: () => onToggleGoalLog?.(goal.id, currentDateKey),
        })),
      ),
    [
      goalLogsCategories,
      logsByGoalDate,
      notesByGoalDate,
      currentDateKey,
      onToggleGoalLog,
    ],
  );

  const pendingItems = allGoalItems.filter((item) => !item.completed);
  const completedItems = allGoalItems.filter((item) => item.completed);

  const dayScore = useMemo(() => {
    const earned = allGoalItems
      .filter((item) => item.completed)
      .reduce((sum, item) => sum + PRIORITY_POINTS[item.priority], 0);
    const max = allGoalItems.reduce(
      (sum, item) => sum + PRIORITY_POINTS[item.priority],
      0,
    );
    const byCategory = goalLogsCategories
      .map((cat) => {
        const items = allGoalItems.filter((i) => i.category === cat.id);
        const catEarned = items
          .filter((i) => i.completed)
          .reduce((s, i) => s + PRIORITY_POINTS[i.priority], 0);
        const catMax = items.reduce(
          (s, i) => s + PRIORITY_POINTS[i.priority],
          0,
        );
        const config =
          DAY_VIEW_CATEGORY_CONFIG[cat.name] ??
          DEFAULT_DAY_VIEW_CATEGORY_CONFIG;
        return { category: cat, config, earned: catEarned, max: catMax };
      })
      .filter((c) => c.max > 0);
    return { earned, max, byCategory };
  }, [allGoalItems, goalLogsCategories]);

  const renderDayScoreRings = (variant: "compact" | "full" = "full") => {
    if (dayScore.max === 0) return null;

    const isCompact = variant === "compact";
    const svgSize = isCompact ? 68 : 120;
    const center = svgSize / 2;
    const strokeWidth = isCompact ? 5 : 8;
    const gap = isCompact ? 3 : 5;
    const step = strokeWidth + gap;
    const outerR = center - 2 - strokeWidth / 2;

    return (
      <div className="group relative shrink-0">
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          role="img"
        >
          <title>Day score progress</title>
          {dayScore.byCategory.map(({ category, config, earned, max }, i) => {
            const r = Math.max(2, outerR - i * step);
            const circ = 2 * Math.PI * r;
            const offset = max > 0 ? circ * (1 - earned / max) : circ;
            return (
              <g key={category.id}>
                <circle
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke={config.color}
                  strokeOpacity={0.15}
                  strokeWidth={strokeWidth}
                />
                <circle
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke={config.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  className="transition-all duration-500"
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: `${center}px ${center}px`,
                  }}
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-bold leading-none",
              isCompact ? "text-base" : "text-xl",
            )}
          >
            {dayScore.earned}
          </span>
          <span
            className={cn(
              "uppercase tracking-wider text-foreground-400",
              isCompact ? "text-[8px]" : "text-[9px]",
            )}
          >
            pts
          </span>
        </div>
        {onShareHabitResults ? (
          <Tooltip
            content="Share habit results"
            placement="top"
            size="sm"
            color="foreground"
          >
            <Button
              isIconOnly
              size="sm"
              variant="flat"
              radius="full"
              aria-label="Share habit results"
              title="Share habit results"
              className={cn(
                "absolute z-10 bg-content1/90 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                isCompact
                  ? "-top-1.5 -right-1.5 h-7 w-7 min-w-7"
                  : "-top-2 -right-2 h-9 w-9 min-w-9",
              )}
              onPress={onShareHabitResults}
            >
              <Icon
                icon="mdi:share-variant-outline"
                className={isCompact ? "h-3.5 w-3.5" : "h-4 w-4"}
              />
            </Button>
          </Tooltip>
        ) : null}
      </div>
    );
  };

  const prioritySections = useMemo(
    () =>
      GOAL_PRIORITY_STAGES.flatMap((priority) => {
        const items = allGoalItems.filter(
          (item) => item.priority === priority && !item.completed,
        );
        if (items.length === 0) return [];
        return [{ priority, items }];
      }),
    [allGoalItems],
  );

  const renderIconButton = (
    item: GoalItem,
    size: "normal" | "small" = "normal",
  ) => {
    const cfg =
      DAY_VIEW_CATEGORY_CONFIG[item.categoryName] ??
      DEFAULT_DAY_VIEW_CATEGORY_CONFIG;
    const tooltipLabel = item.completed
      ? `Mark ${item.label} incomplete`
      : item.label;
    return (
      <Tooltip content={tooltipLabel} color="foreground" key={item.key}>
        <button
          type="button"
          aria-label={tooltipLabel}
          title={tooltipLabel}
          onClick={item.onToggle}
          className={cn(
            "relative flex shrink-0 flex-col items-center justify-center rounded-2xl border transition-all",
            size === "normal"
              ? "h-12 w-12 gap-1.5 p-2 sm:h-24 sm:w-24 sm:gap-2 sm:p-4"
              : "h-10 w-10 gap-1 p-2 sm:h-20 sm:w-20 sm:gap-1.5 sm:p-3",
            item.completed
              ? `${cfg.activeBg} border-transparent text-white shadow-md ${cfg.activeShadow}`
              : `${cfg.inactiveBorder} bg-content2 ${cfg.iconColor} ${cfg.hoverBg} hover:border-transparent`,
          )}
        >
          <Icon
            icon={item.icon}
            className={
              size === "normal"
                ? "h-5 w-5 sm:h-8 sm:w-8 lg:h-10 lg:w-10"
                : "h-5 w-5 sm:h-7 sm:w-7"
            }
          />
          {item.completed && item.note && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/70" />
          )}
        </button>
      </Tooltip>
    );
  };

  const openGoalNote = (item: GoalItem) => {
    setNoteModalGoal({
      key: item.key,
      label: item.label,
      note: item.note,
    });
    setNoteEditorValue(item.note);
  };

  const renderCompletedGoalItem = (item: GoalItem) => (
    <div
      key={item.key}
      className="flex shrink-0 flex-col items-center gap-1.5 sm:w-20"
    >
      {renderIconButton(item, "small")}
      <Button
        size="sm"
        variant={item.note ? "flat" : "light"}
        radius="full"
        className="h-7 min-w-0 px-2 text-[11px] font-medium sm:w-full"
        onPress={() => openGoalNote(item)}
      >
        {item.note ? "Show note" : "Add note"}
      </Button>
    </div>
  );

  const handleSaveNote = async () => {
    if (!noteModalGoal) return;
    setIsSavingNote(true);
    try {
      await onSaveGoalNote?.(
        noteModalGoal.key,
        currentDateKey,
        noteEditorValue ?? "",
      );
      setNoteModalGoal(null);
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto sm:gap-4">
        <div className="px-1 sm:px-0">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold sm:mt-1 sm:text-2xl">
              {formatDayLabel(currentDate)}
            </h2>
            {dayScore.max > 0 ? (
              <div className="shrink-0">
                <div className="sm:hidden">
                  {renderDayScoreRings("compact")}
                </div>
                <div className="hidden sm:block">{renderDayScoreRings()}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 px-1 sm:px-0">
          <div className="grid gap-4">
            <div className="flex flex-col gap-3 sm:gap-5">
              {prioritySections.map(({ priority, items }) => (
                <div key={priority}>
                  <div className="mb-2 flex items-center gap-2 sm:mb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground-500 sm:text-xs">
                      {priority === "high"
                        ? "High Priority"
                        : priority === "medium"
                          ? "Medium Priority"
                          : "Low Priority"}
                    </p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:gap-4 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
                    {items.map((item) => renderIconButton(item))}
                  </div>
                </div>
              ))}

              {(() => {
                const plannedMonthly = periodicGoals.filter(
                  (g) =>
                    logsByGoalDate[`${g.id}_${currentDateKey}`] === "planned",
                );
                if (plannedMonthly.length === 0) return null;
                return (
                  <div>
                    <div className="mb-2 flex items-center gap-2 sm:mb-3">
                      <span className="h-2 w-2 rounded-full bg-foreground-400" />
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground-500 sm:text-xs">
                        Planned Monthly Goals
                      </p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:gap-4 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
                      {plannedMonthly.map((goal) => (
                        <Tooltip
                          key={goal.id}
                          content={goal.name}
                          color="foreground"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onToggleGoalLog?.(goal.id, currentDateKey)
                            }
                            className="relative flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-default-200 bg-content2 p-2 text-foreground-400 transition-all hover:border-transparent hover:bg-foreground/10 hover:text-foreground sm:h-24 sm:w-24 sm:gap-2 sm:p-4"
                          >
                            <Icon
                              icon={goal.iconKey || "mdi:circle"}
                              className="h-5 w-5 sm:h-8 sm:w-8 lg:h-9 lg:w-9"
                            />
                          </button>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const completedPeriodicGoals = periodicGoals.filter(
                  (g) =>
                    logsByGoalDate[`${g.id}_${currentDateKey}`] === "complete",
                );
                const totalCompleted =
                  completedItems.length + completedPeriodicGoals.length;

                if (totalCompleted === 0 && pendingItems.length === 0) {
                  return (
                    <div className="flex items-center justify-center rounded-[20px] border border-dashed border-default-200 py-8 text-sm text-foreground-500">
                      No active goals configured.
                    </div>
                  );
                }

                if (totalCompleted === 0) return null;

                return (
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
                      Show completed ({totalCompleted})
                    </button>
                    {showCompleted && (
                      <div className="mt-2 flex items-start gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:mt-3 sm:flex-wrap sm:gap-4 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
                        {completedItems.map((item) =>
                          renderCompletedGoalItem(item),
                        )}
                        {completedPeriodicGoals.map((goal) => (
                          <Tooltip
                            key={goal.id}
                            content={goal.name}
                            color="foreground"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                onToggleGoalLog?.(goal.id, currentDateKey)
                              }
                              className="relative flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-transparent bg-foreground p-2 text-background shadow-md transition-all sm:h-20 sm:w-20 sm:gap-1.5 sm:p-3"
                            >
                              <Icon
                                icon={goal.iconKey || "mdi:circle"}
                                className="h-5 w-5 sm:h-7 sm:w-7"
                              />
                            </button>
                          </Tooltip>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {dayEntries.length > 0 ? (
          <div className="px-1 sm:px-0">
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
          </div>
        ) : null}
      </div>

      <Modal
        isOpen={noteModalGoal != null}
        onOpenChange={(open) => {
          if (!open) setNoteModalGoal(null);
        }}
        placement="center"
        size="lg"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-0.5">
            <span className="text-base font-semibold">
              {noteModalGoal?.label}
            </span>
            <span className="text-xs font-normal text-foreground-400">
              {currentDateKey}
            </span>
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
                const item = allGoalItems.find(
                  (i) => i.key === noteModalGoal?.key,
                );
                if (item) item.onToggle();
                setNoteModalGoal(null);
              }}
            >
              Mark incomplete
            </Button>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="flat"
                onPress={() => setNoteModalGoal(null)}
              >
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
  initialDashboardOpen = false,
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
      initialCalendarData?.currentGoalLogsSnapshot ?? EMPTY_GOAL_LOGS_SNAPSHOT,
  );
  const [prevMonthGoalLogsByDate, setPrevMonthGoalLogsByDate] = useState<
    Record<string, "complete" | "planned">
  >(() => initialCalendarData?.prevGoalLogsByDate ?? {});
  const [sidebarTasks, setSidebarTasks] = useState<Task[]>([]);
  const [isLoadingSidebarTasks, setIsLoadingSidebarTasks] = useState(true);
  const [updatingSidebarTaskIds, setUpdatingSidebarTaskIds] = useState<
    Set<string>
  >(new Set());
  const taskCompletionDateKey = useMemo(() => todayDateKey(), []);

  const [calSettings, setCalSettings] = useState<CalendarSettingsData>(
    DEFAULT_CALENDAR_SETTINGS,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<CalendarSettingsData>(
    DEFAULT_CALENDAR_SETTINGS,
  );

  useEffect(() => {
    setIsSidebarCollapsed(
      initialDashboardOpen
        ? false
        : window.matchMedia(MOBILE_SIDEBAR_MEDIA_QUERY).matches,
    );
  }, [initialDashboardOpen]);

  useEffect(() => {
    fetchCalendarSettings()
      .then((s) => setCalSettings(s))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    setIsLoadingSidebarTasks(true);

    fetchTasks()
      .then((tasks) => {
        if (!cancelled) {
          setSidebarTasks(tasks);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          addToast({
            title: "Could not load tasks",
            description:
              error instanceof Error
                ? error.message
                : "We couldn't load your task list.",
            color: "warning",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSidebarTasks(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveSettings = async () => {
    await saveCalendarSettings(draftSettings).catch(() => {});
    setCalSettings(draftSettings);
    setIsSettingsOpen(false);
  };

  const currentMonthKey = useMemo(
    () => getMonthKey(currentDate),
    [currentDate],
  );
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
    return goalLogsSnapshot.periodicGoals
      .map((pg) => {
        const targetCount = pg.frequencyGoal ?? 1;
        const completedCount = Object.keys(
          goalLogsSnapshot.logsByGoalDate,
        ).filter((key) => key.startsWith(`${pg.id}_${monthKey}`)).length;
        const completedFraction = Math.min(completedCount / targetCount, 1);
        return {
          pg,
          completedCount,
          plannedCount: 0,
          targetCount,
          completedFraction,
          plannedFraction: 0,
          ratio: completedCount / targetCount,
        };
      })
      .sort((a, b) =>
        a.ratio !== b.ratio ? b.ratio - a.ratio : a.targetCount - b.targetCount,
      );
  }, [currentDate, goalLogsSnapshot]);

  const filteredDailyCategories = useMemo(() => {
    const withDailyGoals = goalLogsSnapshot.categories.filter(
      (c) => c.goals.length > 0,
    );
    if (calSettings.visibleCategoryIds.length === 0) return withDailyGoals;
    return withDailyGoals.filter((c) =>
      calSettings.visibleCategoryIds.includes(c.id),
    );
  }, [goalLogsSnapshot.categories, calSettings.visibleCategoryIds]);

  const displayedGoalMetrics = useMemo(
    () =>
      goalMetrics.filter(
        ({ pg }) => showLowerPriorityGoals || pg.priority === "high",
      ),
    [goalMetrics, showLowerPriorityGoals],
  );

  const allGoalLogsByDate = useMemo<Record<string, "complete" | "planned">>(
    () => ({
      ...prevMonthGoalLogsByDate,
      ...goalLogsSnapshot.logsByGoalDate,
    }),
    [goalLogsSnapshot.logsByGoalDate, prevMonthGoalLogsByDate],
  );

  const dailyGoalMetrics = useMemo(() => {
    return buildDailyGoalMetricsForDate({
      currentDate,
      categories: goalLogsSnapshot.categories,
      logsByGoalDate: allGoalLogsByDate,
    });
  }, [allGoalLogsByDate, currentDate, goalLogsSnapshot.categories]);

  const displayedDailyGoalMetrics = useMemo(
    () =>
      filterDailyGoalMetricsByPriority(
        dailyGoalMetrics,
        showLowerPriorityGoals,
      ),
    [dailyGoalMetrics, showLowerPriorityGoals],
  );

  const buildHabitShareTextForDate = (date: Date) =>
    buildHabitShareText({
      title,
      currentDate: date,
      dailyGoalMetrics: filterDailyGoalMetricsByPriority(
        buildDailyGoalMetricsForDate({
          currentDate: date,
          categories: filteredDailyCategories,
          logsByGoalDate: allGoalLogsByDate,
        }),
        showLowerPriorityGoals,
      ),
    });

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
      (item, index) =>
        items.findIndex((candidate) => candidate.id === item.id) === index,
    );
  }, [goalLogsSnapshot.categories, goalLogsSnapshot.periodicGoals]);

  const topSidebarTasks = useMemo(() => {
    return sidebarTasks
      .filter((task) => task.completedAt === null)
      .sort((a, b) => compareTasksByPriority(a, b, taskCompletionDateKey))
      .slice(0, 5);
  }, [sidebarTasks, taskCompletionDateKey]);

  const copyHabitShareText = async (habitShareText: string) => {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard sharing is not available in this browser.");
    }

    await navigator.clipboard.writeText(habitShareText);
    addToast({
      title: "Copied share results",
      description: "Paste the habit grid into a message to share it.",
      color: "success",
    });
  };

  const handleShareHabitResults = async (date = currentDate) => {
    const habitShareText = buildHabitShareTextForDate(date);

    if (!habitShareText) {
      addToast({
        title: "Nothing to share yet",
        description:
          "No visible daily goal history is available for this view.",
        color: "warning",
      });
      return;
    }

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title,
          text: habitShareText,
        });
        return;
      }

      await copyHabitShareText(habitShareText);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      try {
        await copyHabitShareText(habitShareText);
      } catch (clipboardError) {
        addToast({
          title: "Could not share results",
          description:
            clipboardError instanceof Error
              ? clipboardError.message
              : undefined,
          color: "danger",
        });
      }
    }
  };

  const handleCompleteSidebarTask = (task: Task) => {
    if (task.completedAt === taskCompletionDateKey) {
      return;
    }

    const previousTask = task;
    const nextTask: Task = {
      ...task,
      completedAt: taskCompletionDateKey,
    };

    setSidebarTasks((previous) =>
      previous.map((item) => (item.id === task.id ? nextTask : item)),
    );
    setUpdatingSidebarTaskIds((previous) => new Set(previous).add(task.id));

    void updateTask(task.id, taskToInput(nextTask))
      .then((savedTask) => {
        setSidebarTasks((previous) =>
          previous.map((item) => (item.id === savedTask.id ? savedTask : item)),
        );
      })
      .catch((error) => {
        setSidebarTasks((previous) =>
          previous.map((item) =>
            item.id === previousTask.id ? previousTask : item,
          ),
        );
        addToast({
          title: "Could not complete task",
          description: error instanceof Error ? error.message : undefined,
          color: "danger",
        });
      })
      .finally(() => {
        setUpdatingSidebarTaskIds((previous) => {
          const next = new Set(previous);
          next.delete(task.id);
          return next;
        });
      });
  };

  const handleDayViewToggleGoalLog = (goalId: string, dateKey: string) => {
    const key = `${goalId}_${dateKey}`;
    const currentlyComplete =
      goalLogsSnapshot.logsByGoalDate[key] === "complete";
    setGoalLogsSnapshot((prev) => {
      const next = { ...prev, logsByGoalDate: { ...prev.logsByGoalDate } };
      if (currentlyComplete) delete next.logsByGoalDate[key];
      else next.logsByGoalDate[key] = "complete";
      return next;
    });
    void setGoalLog(
      goalId,
      dateKey,
      currentlyComplete ? null : "complete",
    ).catch(() => {
      setGoalLogsSnapshot((prev) => {
        const next = { ...prev, logsByGoalDate: { ...prev.logsByGoalDate } };
        if (currentlyComplete) next.logsByGoalDate[key] = "complete";
        else delete next.logsByGoalDate[key];
        return next;
      });
      addToast({ title: "Could not save goal", color: "danger" });
    });
  };

  const handleDayViewSaveGoalNote = async (
    goalId: string,
    dateKey: string,
    notes: string,
  ) => {
    const key = `${goalId}_${dateKey}`;
    const prev = goalLogsSnapshot.notesByGoalDate[key] ?? null;
    setGoalLogsSnapshot((s) => ({
      ...s,
      notesByGoalDate: notes.trim()
        ? { ...s.notesByGoalDate, [key]: notes }
        : Object.fromEntries(
            Object.entries(s.notesByGoalDate).filter(([k]) => k !== key),
          ),
    }));
    try {
      await setGoalLogNote(goalId, dateKey, notes);
    } catch {
      setGoalLogsSnapshot((s) => ({
        ...s,
        notesByGoalDate: prev
          ? { ...s.notesByGoalDate, [key]: prev }
          : Object.fromEntries(
              Object.entries(s.notesByGoalDate).filter(([k]) => k !== key),
            ),
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
    // biome-ignore lint/correctness/useExhaustiveDependencies: navigate/openCreateModal are stable refs
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
                  ? "items-end p-1.5 lg:w-14 lg:items-center lg:p-2"
                  : "p-3 lg:w-[250px]",
              )}
            >
              {isSidebarCollapsed ? (
                <>
                  <Button
                    size="sm"
                    variant="light"
                    onPress={() => setIsSidebarCollapsed(false)}
                    title="Show Dashboard"
                    className="h-8 px-2 font-medium text-foreground-500 lg:hidden"
                    endContent={<ChevronRightIcon />}
                  >
                    Show Dashboard
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={() => setIsSidebarCollapsed(false)}
                    title="Show Dashboard"
                    aria-label="Show Dashboard"
                    className="hidden h-8 w-8 lg:inline-flex"
                  >
                    <ChevronRightIcon />
                  </Button>

                  <div className="mt-4 hidden min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto lg:flex" />
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
                        {displayedGoalMetrics.map(
                          ({
                            pg,
                            completedCount,
                            targetCount,
                            completedFraction,
                            plannedFraction,
                          }) => (
                            <div
                              key={pg.id}
                              className="flex items-center gap-2"
                            >
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
                                    style={{
                                      width: `${completedFraction * 100}%`,
                                    }}
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
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-3">
                    <div className="flex w-full items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-400">
                        Top Tasks
                      </span>
                      <span className="ml-auto rounded-full bg-default-100 px-2 py-0.5 text-[9px] font-semibold text-foreground-400">
                        {topSidebarTasks.length}/5
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {isLoadingSidebarTasks ? (
                        <div className="flex items-center gap-2 rounded-xl border border-default-200/50 bg-content1/40 px-2.5 py-2 text-[11px] text-foreground-400">
                          <Icon
                            icon="mdi:loading"
                            className="h-3.5 w-3.5 animate-spin"
                          />
                          Loading tasks
                        </div>
                      ) : topSidebarTasks.length > 0 ? (
                        topSidebarTasks.map((task) => {
                          const isComplete =
                            task.completedAt === taskCompletionDateKey;
                          const isUpdating = updatingSidebarTaskIds.has(
                            task.id,
                          );

                          return (
                            <button
                              type="button"
                              key={task.id}
                              onClick={() => handleCompleteSidebarTask(task)}
                              aria-label={`Complete ${task.name}`}
                              className={cn(
                                "group flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all",
                                isComplete
                                  ? "border-default-200/40 bg-default-100/40 text-foreground-400"
                                  : "border-default-200/60 bg-content1/50 hover:border-default-300 hover:bg-default-100/70",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                                  isComplete
                                    ? "border-success-500/60 bg-success-500/15 text-success-600"
                                    : "border-foreground-400/60 text-transparent group-hover:border-success-500/70",
                                )}
                              >
                                <Icon
                                  icon={
                                    isUpdating ? "mdi:loading" : "mdi:check"
                                  }
                                  className={cn(
                                    "h-3 w-3",
                                    isUpdating &&
                                      "animate-spin text-foreground-400",
                                  )}
                                />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span
                                  className={cn(
                                    "block truncate text-[11px] font-medium",
                                    isComplete && "line-through",
                                  )}
                                >
                                  {task.name}
                                </span>
                                {task.timeRequired && (
                                  <span className="block truncate text-[9px] text-foreground-400">
                                    {task.timeRequired}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed border-default-200/70 px-2.5 py-2 text-[11px] text-foreground-400">
                          No active tasks yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setDailyGoalsCollapsed((v) => !v)}
                      className="flex w-full items-center gap-1 text-left"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-400">
                        Daily Goals (Last 10 Days)
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
                        {displayedDailyGoalMetrics.map(
                          ({ category, goals }) => {
                            if (goals.length === 0) return null;
                            const cfg =
                              CATEGORY_FILL_CONFIG[category.name] ??
                              DEFAULT_CATEGORY_FILL;
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
                          },
                        )}
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
              <CardHeader className="flex flex-col items-start justify-between gap-2 border-b border-default-200 px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3">
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

                  <p className="hidden text-foreground-500 text-xs sm:block">
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
                        className="w-40 sm:w-52"
                        autoFocus
                      />

                      {searchQuery.length > 0 ? (
                        <div className="bg-content1 shadow-medium rounded-2xl border-divider absolute top-full left-0 z-50 mt-2 w-[calc(100vw-3rem)] border p-2 sm:right-0 sm:left-auto sm:w-80">
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

                  <Button
                    size="sm"
                    variant="flat"
                    className="min-w-9 px-0 sm:px-3"
                    startContent={
                      <Icon icon="mdi:cog-outline" className="h-4 w-4" />
                    }
                    title="Calendar Settings"
                    onPress={() => {
                      setDraftSettings(calSettings);
                      setIsSettingsOpen(true);
                    }}
                  >
                    <span className="hidden sm:inline">Calendar Settings</span>
                  </Button>
                </div>
              </CardHeader>

              <CardBody className="min-h-0 flex-1 p-2 sm:p-4">
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
                      onShareHabitResults={(date) =>
                        void handleShareHabitResults(date)
                      }
                      monthlyGoalSlots={calSettings.monthlyGoalSlots}
                      visibleCategoryIds={calSettings.visibleCategoryIds}
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
                      goalLogsCategories={filteredDailyCategories}
                      periodicGoals={goalLogsSnapshot.periodicGoals}
                      logsByGoalDate={goalLogsSnapshot.logsByGoalDate}
                      notesByGoalDate={goalLogsSnapshot.notesByGoalDate}
                      onToggleGoalLog={handleDayViewToggleGoalLog}
                      onSaveGoalNote={handleDayViewSaveGoalNote}
                      onShareHabitResults={() =>
                        void handleShareHabitResults(currentDate)
                      }
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

      <Modal
        isOpen={isSettingsOpen}
        onOpenChange={(open) => setIsSettingsOpen(open)}
        size="md"
        backdrop="blur"
      >
        <ModalContent>
          <ModalHeader>Calendar Settings</ModalHeader>
          <ModalBody className="gap-5 pb-2">
            <Select
              label="Daily goal categories"
              placeholder="All categories"
              selectionMode="multiple"
              selectedKeys={new Set(draftSettings.visibleCategoryIds)}
              onSelectionChange={(keys) =>
                setDraftSettings((s) => ({
                  ...s,
                  visibleCategoryIds: [...keys] as string[],
                }))
              }
              description="Only selected categories appear in the calendar. Leave empty to show all."
            >
              {goalLogsSnapshot.categories
                .filter((c) => c.goals.length > 0)
                .map((c) => (
                  <SelectItem key={c.id}>{c.name}</SelectItem>
                ))}
            </Select>

            <Select
              label="Monthly goal slots per day"
              selectedKeys={new Set([String(draftSettings.monthlyGoalSlots)])}
              onSelectionChange={(keys) => {
                const val = Number([...keys][0]);
                if (!Number.isNaN(val))
                  setDraftSettings((s) => ({ ...s, monthlyGoalSlots: val }));
              }}
            >
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <SelectItem key={String(n)}>{String(n)}</SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsSettingsOpen(false)}>
              Cancel
            </Button>
            <Button color="primary" onPress={handleSaveSettings}>
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export function MonthCalendar({
  initialDate,
  initialCalendarData,
  initialDashboardOpen,
}: Pick<
  PortableCalendarProps,
  "initialDate" | "initialCalendarData" | "initialDashboardOpen"
>) {
  return (
    <PortableCalendar
      title="Habit Calendar"
      initialView="day"
      initialDate={initialDate}
      initialCalendarData={initialCalendarData}
      initialDashboardOpen={initialDashboardOpen}
    />
  );
}
