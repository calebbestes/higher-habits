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
  type AcceptedGoalIncentive,
  type CategoryWithGoals,
  EMPTY_GOAL_LOGS_SNAPSHOT,
  type GoalLogsSnapshot,
  type PeriodicGoalInfo,
  fetchGoalLogsSnapshot,
  setGoalLog,
  setGoalLogNote,
} from "@/lib/goal-logs-client";
import {
  type GoalPhoto,
  deleteGoalPhoto,
  fetchGoalPhotos,
  uploadGoalPhoto,
} from "@/lib/goal-photos-client";
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
  Button,
  Card,
  CardBody,
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
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Textarea,
  Tooltip,
  addToast,
  useDisclosure,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import type { CSSProperties, ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryGoalDrawer } from "./category-goal-drawer";
import { DayIconPickerDrawer } from "./day-icon-picker-drawer";
import { PRAYER_CHECKLIST_ITEMS } from "./prayer-checklist-drawer";
import { RichTextEditor } from "./rich-text-editor";
import { SettingsLink } from "./settings-link";
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
  dashboardMode?: "embedded" | "hidden" | "standalone";
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

const DEFAULT_ENTRY_COLOR = "#F3B7B9";
const UNCATEGORIZED_CATEGORY: PortableCalendarCategory = {
  id: "__uncategorized__",
  name: "Uncategorized",
  color: "#516162",
};

const CORE_CATEGORIES: PortableCalendarCategory[] = [
  { id: "spiritual", name: "Spiritual", color: "#2C5352" },
  { id: "physical", name: "Physical", color: "#9D7474" },
  { id: "social", name: "Social", color: "#A0D5D5" },
  { id: "financial-career", name: "Financial/Career", color: "#F3B7B9" },
];

const CALENDAR_ENTRY_CATEGORY_ICONS: Record<string, string> = {
  spiritual: "mdi:hands-pray",
  physical: "mdi:dumbbell",
  social: "mdi:account-group-outline",
  "financial-career": "mdi:briefcase-outline",
  __uncategorized__: "mdi:calendar-blank-outline",
};

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
    fill: "text-[#2C5352]",
    bar: "bg-[#2C5352]",
    label: "text-[#2C5352]",
  },
  Physical: {
    fill: "text-[#9D7474]",
    bar: "bg-[#9D7474]",
    label: "text-[#9D7474]",
  },
  Work: {
    fill: "text-[#516162]",
    bar: "bg-[#516162]",
    label: "text-[#516162]",
  },
  Social: {
    fill: "text-[#A0D5D5]",
    bar: "bg-[#A0D5D5]",
    label: "text-[#516162]",
  },
  "Hobbies/Social": {
    fill: "text-[#A0D5D5]",
    bar: "bg-[#A0D5D5]",
    label: "text-[#516162]",
  },
  "Financial/Career": {
    fill: "text-[#F3B7B9]",
    bar: "bg-[#F3B7B9]",
    label: "text-[#9D7474]",
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

function weeksBetween(ref: Date, d: Date): number {
  return Math.round(
    (startOfWeek(d).getTime() - startOfWeek(ref).getTime()) /
      (7 * 24 * 60 * 60 * 1000),
  );
}

function weekOfMonth(d: Date): number {
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() + 7 > daysInMonth) return 4;
  return Math.ceil(d.getDate() / 7) - 1;
}

function isGoalScheduledForDate(
  goal: Pick<
    PeriodicGoalInfo,
    | "period"
    | "repeatInterval"
    | "repeatDays"
    | "repeatMonthlyType"
    | "createdAt"
  >,
  date: Date,
): boolean {
  if (goal.period === "daily") return true;
  const interval = goal.repeatInterval ?? 1;
  const dow = date.getDay();

  if (goal.period === "weekly") {
    const days = goal.repeatDays;
    if (days && days.length > 0 && !days.includes(dow)) return false;
    if (interval === 1) return true;
    return weeksBetween(new Date(goal.createdAt), date) % interval === 0;
  }

  if (goal.period === "monthly") {
    const ref = new Date(goal.createdAt);
    const monthDiff =
      (date.getFullYear() - ref.getFullYear()) * 12 +
      (date.getMonth() - ref.getMonth());
    if (monthDiff % interval !== 0) return false;
    const type = goal.repeatMonthlyType ?? "day_of_month";
    if (type === "day_of_month") return date.getDate() === ref.getDate();
    return dow === ref.getDay() && weekOfMonth(date) === weekOfMonth(ref);
  }

  return false;
}

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

const getReadableAccentColor = (color: string) =>
  color.toUpperCase() === "#A0D5D5" || color.toUpperCase() === "#F3B7B9"
    ? "#2C5352"
    : color;

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
            fillClassName ?? "text-[#2C5352]",
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
    fillClassName="text-[#9D7474]"
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
    fillClassName="text-[#516162]"
  />
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
      style={{ color: getReadableAccentColor(entry.color) }}
    >
      {entry.title}
    </span>
    <span
      className={cn(
        "shrink-0 font-medium opacity-70",
        compact ? "text-[10px]" : "text-[11px]",
      )}
      style={{ color: getReadableAccentColor(entry.color) }}
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
  const visibleGoalCategories = useMemo(
    () =>
      goalLogsSnapshot.categories.filter(
        (category) =>
          category.goals.length > 0 &&
          (visibleCategoryIds.length === 0 ||
            visibleCategoryIds.includes(category.id)),
      ),
    [goalLogsSnapshot.categories, visibleCategoryIds],
  );
  const selectedDateKey = toDateKey(selectedDate);
  const selectedDayEntries = entries
    .filter((entry) => isDateInEntryRange(selectedDate, entry))
    .sort(compareEntries);
  const selectedPeriodicGoals = goalLogsSnapshot.periodicGoals.map((goal) => ({
    goal,
    status: goalLogsSnapshot.logsByGoalDate[`${goal.id}_${selectedDateKey}`] as
      | "complete"
      | "planned"
      | undefined,
  }));

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
          acceptedGoalIncentives: goalsSnap.acceptedGoalIncentives,
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
          photoCountsByGoalDate: {
            ...Object.fromEntries(
              Object.entries(previous.photoCountsByGoalDate).filter(([key]) => {
                const dateKey = key.slice(-10);
                return (
                  !dateKey.startsWith(currentMonthKey) &&
                  !dateKey.startsWith(prevMonthKey)
                );
              }),
            ),
            ...(prevGoalsSnap.photoCountsByGoalDate ?? {}),
            ...(goalsSnap.photoCountsByGoalDate ?? {}),
          },
          visibilityByGoalDate: {
            ...Object.fromEntries(
              Object.entries(previous.visibilityByGoalDate).filter(([key]) => {
                const dateKey = key.slice(-10);
                return (
                  !dateKey.startsWith(currentMonthKey) &&
                  !dateKey.startsWith(prevMonthKey)
                );
              }),
            ),
            ...(prevGoalsSnap.visibilityByGoalDate ?? {}),
            ...(goalsSnap.visibilityByGoalDate ?? {}),
          },
          plannedTimesByGoalDate: {
            ...Object.fromEntries(
              Object.entries(previous.plannedTimesByGoalDate).filter(
                ([key]) => {
                  const dateKey = key.slice(-10);
                  return (
                    !dateKey.startsWith(currentMonthKey) &&
                    !dateKey.startsWith(prevMonthKey)
                  );
                },
              ),
            ),
            ...(prevGoalsSnap.plannedTimesByGoalDate ?? {}),
            ...(goalsSnap.plannedTimesByGoalDate ?? {}),
          },
          socialByGoalDate: {
            ...Object.fromEntries(
              Object.entries(previous.socialByGoalDate ?? {}).filter(
                ([key]) => {
                  const dateKey = key.slice(-10);
                  return (
                    !dateKey.startsWith(currentMonthKey) &&
                    !dateKey.startsWith(prevMonthKey)
                  );
                },
              ),
            ),
            ...(prevGoalsSnap.socialByGoalDate ?? {}),
            ...(goalsSnap.socialByGoalDate ?? {}),
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6 sm:hidden">
        <div>
          <div className="mb-2 grid grid-cols-7 px-1 text-center text-[11px] font-semibold text-foreground-400">
            {DAY_NAMES.map((day) => (
              <span key={day}>{day.slice(0, 1)}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weeks.flatMap((week) =>
              week.map(({ date, isOutside }) => {
                const dateKey = toDateKey(date);
                const isSelected = isSameDay(date, selectedDate);
                const dailyGoalCount = visibleGoalCategories.reduce(
                  (count, category) => count + category.goals.length,
                  0,
                );
                const completedDailyCount = visibleGoalCategories.reduce(
                  (count, category) =>
                    count +
                    category.goals.filter(
                      (goal) =>
                        goalLogsSnapshot.logsByGoalDate[
                          `${goal.id}_${dateKey}`
                        ] === "complete",
                    ).length,
                  0,
                );
                const completedPeriodicGoals =
                  goalLogsSnapshot.periodicGoals.filter(
                    (goal) =>
                      goalLogsSnapshot.logsByGoalDate[
                        `${goal.id}_${dateKey}`
                      ] === "complete",
                  );
                const plannedPeriodicGoals =
                  goalLogsSnapshot.periodicGoals.filter(
                    (goal) =>
                      goalLogsSnapshot.logsByGoalDate[
                        `${goal.id}_${dateKey}`
                      ] === "planned",
                  );
                const progress =
                  dailyGoalCount > 0 ? completedDailyCount / dailyGoalCount : 0;
                const completionPercentage = Math.round(progress * 100);
                const dayEntries = entries.filter((entry) =>
                  isDateInEntryRange(date, entry),
                );
                const activityIndicators = [
                  ...completedPeriodicGoals.map((goal) => ({
                    key: `complete-${goal.id}`,
                    icon: goal.iconKey || "mdi:star-outline",
                    label: `${goal.name}, complete`,
                    backgroundColor: "#2C5352",
                    color: "#FFFFFF",
                  })),
                  ...plannedPeriodicGoals.map((goal) => ({
                    key: `planned-${goal.id}`,
                    icon: goal.iconKey || "mdi:star-outline",
                    label: `${goal.name}, planned`,
                    backgroundColor: "#F3B7B9",
                    color: "#9D7474",
                  })),
                  ...dayEntries.map((entry) => ({
                    key: `entry-${entry.id}`,
                    icon:
                      CALENDAR_ENTRY_CATEGORY_ICONS[entry.category.id] ??
                      "mdi:calendar-blank-outline",
                    label: entry.title,
                    backgroundColor: withAlpha(entry.color, "35"),
                    color: getReadableAccentColor(entry.color),
                  })),
                ];
                const activityLabel = activityIndicators
                  .map((indicator) => indicator.label)
                  .join(", ");

                return (
                  <button
                    type="button"
                    key={date.toISOString()}
                    aria-label={`${formatDayLabel(date)}, ${completionPercentage}% of daily goals complete${activityLabel ? `, ${activityLabel}` : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelectDate(date)}
                    className={cn(
                      "flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl px-0.5 py-1.5 text-center transition-colors",
                      isSelected
                        ? "bg-[#A0D5D5]/35 text-[#2C5352]"
                        : "bg-content1 text-foreground-600",
                      isOutside && !isSelected && "opacity-35",
                    )}
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full p-[2px]"
                      style={{
                        background:
                          progress > 0
                            ? `conic-gradient(#2C5352 ${progress * 360}deg, rgba(160, 213, 213, 0.35) 0deg)`
                            : "rgba(160, 213, 213, 0.22)",
                      }}
                    >
                      <span
                        className={cn(
                          "flex h-full w-full items-center justify-center rounded-full bg-content1 text-[11px] font-semibold tabular-nums",
                          isToday(date) && "bg-[#2C5352] text-white",
                        )}
                      >
                        {date.getDate()}
                      </span>
                    </span>

                    <span className="mt-1 flex h-4 max-w-full items-center justify-center gap-0.5">
                      {activityIndicators.slice(0, 3).map((indicator) => (
                        <span
                          key={indicator.key}
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]"
                          style={{
                            backgroundColor: indicator.backgroundColor,
                            color: indicator.color,
                          }}
                          title={indicator.label}
                        >
                          <Icon icon={indicator.icon} className="h-2.5 w-2.5" />
                        </span>
                      ))}
                      {activityIndicators.length > 3 ? (
                        <span className="text-[8px] font-semibold leading-none text-foreground-400">
                          +{activityIndicators.length - 3}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              }),
            )}
          </div>
        </div>

        <section className="rounded-2xl bg-default-100/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-[#2C5352]">
                {formatDayLabel(selectedDate)}
              </p>
              <p className="text-xs text-foreground-400">
                Tap a goal to update its report
              </p>
            </div>
            <Button
              size="sm"
              color="primary"
              className="shrink-0 bg-[#2C5352] text-white"
              startContent={<PlusIcon />}
              onPress={() => handleOpenMonthlyGoalPicker(selectedDate)}
            >
              Add
            </Button>
          </div>

          {selectedPeriodicGoals.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-foreground-500">
                  Monthly Goals
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-[#2C5352]"
                  onClick={() => handleOpenMonthlyGoalPicker(selectedDate)}
                >
                  Manage
                </button>
              </div>
              <div className="space-y-2">
                {selectedPeriodicGoals.map(({ goal, status }) => (
                  <button
                    type="button"
                    key={goal.id}
                    onClick={() =>
                      handleToggleGoalLog(goal.id, selectedDateKey)
                    }
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                      status === "complete"
                        ? "bg-[#A0D5D5]/35"
                        : status === "planned"
                          ? "bg-[#F3B7B9]/25"
                          : "bg-content1",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        status === "complete"
                          ? "bg-[#2C5352] text-white"
                          : status === "planned"
                            ? "bg-[#F3B7B9]/60 text-[#9D7474]"
                            : "bg-default-100 text-foreground-500",
                      )}
                    >
                      <Icon
                        icon={goal.iconKey || "mdi:star-outline"}
                        className="h-4 w-4"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {goal.name}
                      </span>
                      <span className="block text-xs text-foreground-400">
                        {status === "complete"
                          ? "Complete"
                          : status === "planned"
                            ? "Planned"
                            : "Not reported"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                        status === "complete"
                          ? "border-[#2C5352] bg-[#2C5352] text-white"
                          : status === "planned"
                            ? "border-[#9D7474] text-[#9D7474]"
                            : "border-default-300 text-transparent",
                      )}
                    >
                      <Icon
                        icon={
                          status === "planned"
                            ? "mdi:clock-outline"
                            : "mdi:check"
                        }
                        className="h-3.5 w-3.5"
                      />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {selectedDayEntries.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-foreground-500">
                Schedule
              </p>
              <div className="space-y-2">
                {selectedDayEntries.map((entry) => (
                  <CategoryPill
                    key={entry.id}
                    entry={entry}
                    compact
                    onPress={() => onSelectEntry(entry)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {selectedPeriodicGoals.length === 0 &&
          selectedDayEntries.length === 0 ? (
            <div className="mt-4 rounded-xl bg-content1 px-3 py-6 text-center text-sm text-foreground-400">
              Nothing planned for this day yet.
            </div>
          ) : null}
        </section>
      </div>

      <Table
        aria-label="Month calendar"
        removeWrapper
        shadow="none"
        classNames={{
          base: "hidden h-full min-h-0 overflow-hidden rounded-xl border border-default-300 bg-content1 sm:block",
          table: "h-full table-fixed w-full",
          tr: "h-auto",
          th: "bg-default-100/80 text-foreground-500 py-1.5 text-center text-[10px] font-semibold sm:py-2 sm:text-xs",
          td: "relative h-auto align-top p-0",
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
                      "relative cursor-pointer overflow-hidden p-0 transition-colors hover:bg-default-100/50",
                      dayIndex < 6 && "border-r border-default-200",
                      weekIndex < weeks.length - 1 &&
                        "border-b border-default-200",
                      isOutside && "bg-content2/15",
                      isSelected && "ring-primary/70 ring-1 ring-inset",
                    )}
                    onClick={() => onSelectDate(date)}
                  >
                    <div className="absolute inset-0 min-w-0 overflow-hidden p-0.5 sm:p-2">
                      {(() => {
                        const cellDateKey = toDateKey(date);
                        const categories = goalLogsSnapshot.categories.filter(
                          (c) =>
                            c.goals.length > 0 &&
                            (visibleCategoryIds.length === 0 ||
                              visibleCategoryIds.includes(c.id)),
                        );
                        const anyProgress = categories.some((c) =>
                          c.goals.some(
                            (g) =>
                              goalLogsSnapshot.logsByGoalDate[
                                `${g.id}_${cellDateKey}`
                              ] === "complete",
                          ),
                        );
                        const svgSize = 42;
                        const center = svgSize / 2;
                        const strokeWidth = 3;
                        const gap = 2;
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
                              g.status === "complete" ||
                              g.status === "planned" ||
                              isGoalScheduledForDate(g, date),
                          );
                        return (
                          <div className="mb-1 min-w-0">
                            <div className="mb-0.5 flex min-h-5 items-center gap-0.5 sm:mb-1 sm:min-h-6 sm:gap-1">
                              {anyProgress ? (
                                <div className="group relative inline-flex shrink-0">
                                  <svg
                                    width={svgSize}
                                    height={svgSize}
                                    viewBox={`0 0 ${svgSize} ${svgSize}`}
                                    role="img"
                                    className="h-[18px] w-[18px] sm:h-9 sm:w-9"
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
                                            transform={`rotate(-90 ${center} ${center})`}
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
                                        className="absolute -top-2 -right-2 z-10 hidden h-7 w-7 min-w-7 bg-content1/90 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:inline-flex"
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                        onPress={() =>
                                          onShareHabitResults(date)
                                        }
                                      >
                                        <Icon
                                          icon="mdi:share-variant-outline"
                                          className="h-3.5 w-3.5"
                                        />
                                      </Button>
                                    </Tooltip>
                                  ) : null}
                                </div>
                              ) : null}
                              <span
                                className={cn(
                                  "ml-auto flex h-4 min-w-4 items-center justify-center text-[9px] font-semibold tabular-nums sm:h-6 sm:min-w-6 sm:text-xs",
                                  isOutside && "text-foreground-400",
                                  isToday(date) &&
                                    "bg-primary text-primary-foreground rounded-full",
                                )}
                              >
                                {date.getDate()}
                              </span>
                            </div>

                            {categories.length > 0 ? (
                              <div className="grid min-w-0 grid-cols-2 gap-0.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-1">
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
                                      title={
                                        goalForSlot?.name ?? "Monthly goal"
                                      }
                                      aria-label={
                                        goalForSlot?.name ?? "Monthly goal"
                                      }
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleOpenMonthlyGoalPicker(date);
                                      }}
                                      className={cn(
                                        "inline-flex aspect-square w-full min-w-0 items-center justify-center rounded border transition-all sm:h-8 sm:w-8 sm:rounded-lg",
                                        isComplete
                                          ? "border-[#A0D5D5] bg-[#A0D5D5]/35 text-[#2C5352]"
                                          : isPlanned
                                            ? "border-default-300 bg-content2 text-foreground-400"
                                            : "border-dashed border-default-200/70 bg-content1/40 text-foreground-300 opacity-90",
                                      )}
                                    >
                                      <Icon
                                        icon={
                                          goalForSlot?.iconKey ?? "mdi:plus"
                                        }
                                        className="h-3.5 w-3.5 sm:h-5 sm:w-5"
                                      />
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {visibleEntries.length > 0 ? (
                        <div
                          className="mt-0.5 flex items-center gap-0.5 overflow-hidden sm:hidden"
                          aria-label={`${dayEntries.length} calendar ${dayEntries.length === 1 ? "entry" : "entries"}`}
                        >
                          {visibleEntries.map((entry) => (
                            <span
                              key={`${entry.id}-${date.toISOString()}-dot`}
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                          ))}
                          {hiddenEntries.length > 0 ? (
                            <span className="truncate text-[8px] leading-none text-foreground-400">
                              +{hiddenEntries.length}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="hidden space-y-1 sm:block">
                        {visibleEntries.map((entry) => (
                          <Chip
                            key={`${entry.id}-${date.toISOString()}`}
                            size="sm"
                            variant="flat"
                            className="h-6 w-full max-w-full cursor-pointer justify-start border border-transparent text-xs transition-all hover:border-current"
                            style={
                              {
                                backgroundColor: withAlpha(entry.color, "20"),
                                color: getReadableAccentColor(entry.color),
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
                                          color: getReadableAccentColor(
                                            entry.color,
                                          ),
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
    color: string;
    foregroundColor: string;
  }
> = {
  // Lowercase keys for legacy DayView, uppercase for DB-driven categories
  spiritual: {
    color: "#2C5352",
    foregroundColor: "#FFFFFF",
  },
  physical: {
    color: "#9D7474",
    foregroundColor: "#FFFFFF",
  },
  work: {
    color: "#516162",
    foregroundColor: "#FFFFFF",
  },
  social: {
    color: "#A0D5D5",
    foregroundColor: "#2C5352",
  },
  "financial-career": {
    color: "#F3B7B9",
    foregroundColor: "#2C5352",
  },
  Spiritual: {
    color: "#2C5352",
    foregroundColor: "#FFFFFF",
  },
  Physical: {
    color: "#9D7474",
    foregroundColor: "#FFFFFF",
  },
  Work: {
    color: "#516162",
    foregroundColor: "#FFFFFF",
  },
  Social: {
    color: "#A0D5D5",
    foregroundColor: "#2C5352",
  },
  "Hobbies/Social": {
    color: "#A0D5D5",
    foregroundColor: "#2C5352",
  },
  "Financial/Career": {
    color: "#F3B7B9",
    foregroundColor: "#2C5352",
  },
};
const DEFAULT_DAY_VIEW_CATEGORY_CONFIG = {
  color: "#516162",
  foregroundColor: "#FFFFFF",
};
const GOAL_PRIORITY_STAGES = ["high", "low"] as const;

type GoalPriorityStage = (typeof GOAL_PRIORITY_STAGES)[number];

const PRIORITY_POINTS: Record<GoalPriorityStage, number> = {
  high: 3,
  low: 1,
};

const PRIORITY_LABELS: Record<GoalPriorityStage, string> = {
  high: "High Priority",
  low: "Low Priority",
};

const PERIOD_BADGE_LABELS: Record<string, string> = {
  weekly: "Weekly goal",
  monthly: "Monthly goal",
};

const DayView = ({
  currentDate,
  entries,
  onSelectEntry,
  goalLogsCategories = [],
  periodicGoals = [],
  acceptedGoalIncentives = [],
  logsByGoalDate = {},
  notesByGoalDate = {},
  photoCountsByGoalDate = {},
  onToggleGoalLog,
  onSaveGoalNote,
  onGoalPhotoCountChange,
  onShareHabitResults,
  onNavigateDay,
}: {
  currentDate: Date;
  entries: NormalizedCalendarEntry[];
  onSelectEntry: (entry: NormalizedCalendarEntry) => void;
  goalLogsCategories?: CategoryWithGoals[];
  periodicGoals?: PeriodicGoalInfo[];
  acceptedGoalIncentives?: AcceptedGoalIncentive[];
  logsByGoalDate?: Record<string, "complete" | "planned">;
  notesByGoalDate?: Record<string, string>;
  photoCountsByGoalDate?: Record<string, number>;
  onToggleGoalLog?: (goalId: string, dateKey: string) => void;
  onSaveGoalNote?: (goalId: string, dateKey: string, notes: string) => void;
  onGoalPhotoCountChange?: (
    goalId: string,
    dateKey: string,
    count: number,
  ) => void;
  onShareHabitResults?: () => void;
  onNavigateDay?: (direction: number) => void;
}) => {
  type GoalItem = {
    key: string;
    label: string;
    icon: string;
    category: string;
    categoryName: string;
    categoryIcon: string;
    priority: GoalPriorityStage;
    completed: boolean;
    period: "daily" | "weekly" | "monthly";
    isScheduled: boolean;
    incentive:
      | (AcceptedGoalIncentive & {
          completedDays: number;
          progress: number;
        })
      | null;
    note: string | null;
    photoCount: number;
    sharedGoals: Array<{
      id: string;
      name: string;
      mode: "collaborative" | "competitive";
    }>;
    onToggle: () => void;
  };

  const [showCompleted, setShowCompleted] = useState(false);
  const [openPriorities, setOpenPriorities] = useState<
    Record<GoalPriorityStage, boolean>
  >({
    high: true,
    low: false,
  });
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(
    null,
  );

  const currentDateKey = toDateKey(currentDate);

  const [noteModalGoal, setNoteModalGoal] = useState<{
    key: string;
    label: string;
    note: string | null;
  } | null>(null);
  const [actionGoal, setActionGoal] = useState<GoalItem | null>(null);
  const [noteEditorValue, setNoteEditorValue] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [goalPhotos, setGoalPhotos] = useState<GoalPhoto[]>([]);
  const [isLoadingGoalPhotos, setIsLoadingGoalPhotos] = useState(false);
  const [isUploadingGoalPhoto, setIsUploadingGoalPhoto] = useState(false);
  const [deletingGoalPhotoIds, setDeletingGoalPhotoIds] = useState<Set<string>>(
    new Set(),
  );
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const dayEntries = useMemo(
    () =>
      entries
        .filter((entry) => isDateInEntryRange(currentDate, entry))
        .sort(compareEntries),
    [currentDate, entries],
  );

  const categoryById = useMemo(
    () =>
      new Map(goalLogsCategories.map((category) => [category.id, category])),
    [goalLogsCategories],
  );

  const incentiveByGoalId = useMemo(() => {
    const incentives = new Map<
      string,
      AcceptedGoalIncentive & {
        completedDays: number;
        progress: number;
      }
    >();
    const selectedDay = startOfDay(currentDate);

    for (const incentive of acceptedGoalIncentives) {
      if (incentives.has(incentive.goalId)) continue;

      const startDate = startOfDay(toDate(incentive.createdAt));
      if (selectedDay < startDate) continue;

      const completedDays = Array.from(
        { length: incentive.streakDays },
        (_, index) => addDays(startDate, index),
      ).filter(
        (date) =>
          date <= selectedDay &&
          logsByGoalDate[`${incentive.goalId}_${toDateKey(date)}`] ===
            "complete",
      ).length;

      incentives.set(incentive.goalId, {
        ...incentive,
        completedDays,
        progress: Math.min(completedDays / incentive.streakDays, 1),
      });
    }

    return incentives;
  }, [acceptedGoalIncentives, currentDate, logsByGoalDate]);

  const allGoalItems = useMemo<GoalItem[]>(() => {
    const dailyItems = goalLogsCategories.flatMap((cat) =>
      cat.goals.map((goal) => {
        const status = logsByGoalDate[`${goal.id}_${currentDateKey}`] ?? null;
        return {
          key: goal.id,
          label: goal.name,
          icon: goal.iconKey || "mdi:circle",
          category: cat.id,
          categoryName: cat.name,
          categoryIcon: cat.icon || "mdi:circle",
          priority: goal.priority,
          completed: status === "complete",
          period: "daily" as const,
          isScheduled: false,
          incentive: incentiveByGoalId.get(goal.id) ?? null,
          note: notesByGoalDate[`${goal.id}_${currentDateKey}`] ?? null,
          photoCount:
            photoCountsByGoalDate[`${goal.id}_${currentDateKey}`] ?? 0,
          sharedGoals: goal.sharedGoals,
          onToggle: () => onToggleGoalLog?.(goal.id, currentDateKey),
        };
      }),
    );

    const scheduledItems = periodicGoals.flatMap((goal) => {
      const status = logsByGoalDate[`${goal.id}_${currentDateKey}`] ?? null;
      if (status !== "planned" && status !== "complete") return [];

      const category = categoryById.get(goal.categoryId);
      return [
        {
          key: goal.id,
          label: goal.name,
          icon: goal.iconKey || "mdi:circle",
          category: goal.categoryId,
          categoryName: category?.name ?? "Goals",
          categoryIcon: category?.icon || "mdi:calendar-check-outline",
          priority: goal.priority,
          completed: status === "complete",
          period: goal.period,
          isScheduled: true,
          incentive: incentiveByGoalId.get(goal.id) ?? null,
          note: notesByGoalDate[`${goal.id}_${currentDateKey}`] ?? null,
          photoCount:
            photoCountsByGoalDate[`${goal.id}_${currentDateKey}`] ?? 0,
          sharedGoals: goal.sharedGoals,
          onToggle: () => onToggleGoalLog?.(goal.id, currentDateKey),
        },
      ];
    });

    return [...scheduledItems, ...dailyItems];
  }, [
    categoryById,
    incentiveByGoalId,
    goalLogsCategories,
    periodicGoals,
    logsByGoalDate,
    notesByGoalDate,
    photoCountsByGoalDate,
    currentDateKey,
    onToggleGoalLog,
  ]);

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
    const ringCount = Math.max(1, dayScore.byCategory.length);
    const outerEdge = center - 2;
    const innerEdge = isCompact ? 14 : 20;
    const availableBand = outerEdge - innerEdge;
    const maxStrokeWidth = isCompact ? 5 : 8;
    const gapRatio = 0.25;
    const strokeWidth = Math.min(
      maxStrokeWidth,
      availableBand / (ringCount + Math.max(0, ringCount - 1) * gapRatio),
    );
    const gap = strokeWidth * gapRatio;
    const step = strokeWidth + gap;
    const outerR = outerEdge - strokeWidth / 2;

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
            const r = outerR - i * step;
            const circ = 2 * Math.PI * r;
            const progress =
              max > 0 ? Math.max(0, Math.min(earned / max, 1)) : 0;
            const offset = circ * (1 - progress);
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
                  transform={`rotate(-90 ${center} ${center})`}
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

  const prioritySections = useMemo(() => {
    return GOAL_PRIORITY_STAGES.map((priority) => {
      const groupsByCategory = new Map<
        string,
        {
          key: string;
          categoryId: string;
          categoryName: string;
          categoryIcon: string;
          items: GoalItem[];
        }
      >();

      for (const item of allGoalItems) {
        if (item.priority !== priority || item.completed) continue;

        const key = `${priority}:${item.category}`;
        const existing = groupsByCategory.get(key);
        if (existing) {
          existing.items.push(item);
          continue;
        }
        groupsByCategory.set(key, {
          key,
          categoryId: item.category,
          categoryName: item.categoryName,
          categoryIcon: item.categoryIcon,
          items: [item],
        });
      }

      const groups = Array.from(groupsByCategory.values())
        .map((group) => ({
          ...group,
          items: [...group.items].sort((a, b) => {
            const scheduledSort = Number(b.isScheduled) - Number(a.isScheduled);
            if (scheduledSort !== 0) return scheduledSort;
            return a.label.localeCompare(b.label);
          }),
        }))
        .sort((a, b) => {
          const scheduledSort =
            Number(b.items.some((item) => item.isScheduled)) -
            Number(a.items.some((item) => item.isScheduled));
          if (scheduledSort !== 0) return scheduledSort;
          return a.categoryName.localeCompare(b.categoryName);
        });

      return {
        priority,
        groups,
        itemCount: groups.reduce((sum, group) => sum + group.items.length, 0),
      };
    }).filter((section) => section.itemCount > 0);
  }, [allGoalItems]);

  const openGoalActions = (item: GoalItem) => {
    setActionGoal(item);
    setGoalPhotos([]);
    setIsLoadingGoalPhotos(true);
    void fetchGoalPhotos(item.key, currentDateKey)
      .then((photos) => {
        setGoalPhotos(photos);
        onGoalPhotoCountChange?.(item.key, currentDateKey, photos.length);
      })
      .catch((error) => {
        addToast({
          title: "Could not load photos",
          description: error instanceof Error ? error.message : undefined,
          color: "danger",
        });
      })
      .finally(() => setIsLoadingGoalPhotos(false));
  };

  const handleGoalPhotoSelected = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file || !actionGoal) return;

    setIsUploadingGoalPhoto(true);
    try {
      const photo = await uploadGoalPhoto(actionGoal.key, currentDateKey, file);
      setGoalPhotos((previous) => {
        const next = [photo, ...previous];
        onGoalPhotoCountChange?.(actionGoal.key, currentDateKey, next.length);
        return next;
      });
      addToast({ title: "Photo added", color: "success" });
    } catch (error) {
      addToast({
        title: "Could not add photo",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    } finally {
      setIsUploadingGoalPhoto(false);
    }
  };

  const handleDeleteGoalPhoto = async (photoId: string) => {
    if (!actionGoal) return;

    setDeletingGoalPhotoIds((previous) => new Set(previous).add(photoId));
    try {
      await deleteGoalPhoto(photoId);
      setGoalPhotos((previous) => {
        const next = previous.filter((photo) => photo.id !== photoId);
        onGoalPhotoCountChange?.(actionGoal.key, currentDateKey, next.length);
        return next;
      });
    } catch (error) {
      addToast({
        title: "Could not delete photo",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    } finally {
      setDeletingGoalPhotoIds((previous) => {
        const next = new Set(previous);
        next.delete(photoId);
        return next;
      });
    }
  };

  const togglePriority = (priority: GoalPriorityStage) => {
    setOpenPriorities((previous) => ({
      ...previous,
      [priority]: !previous[priority],
    }));
  };

  const toggleCategory = (categoryKey: string) => {
    setExpandedCategoryKey((current) =>
      current === categoryKey ? null : categoryKey,
    );
  };

  const renderGoalBadges = (item: GoalItem) => {
    const periodLabel =
      item.period && PERIOD_BADGE_LABELS[item.period]
        ? PERIOD_BADGE_LABELS[item.period]
        : "Scheduled goal";
    const badges = [
      item.isScheduled ? (
        <span
          key="scheduled"
          title={periodLabel}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-default-100 text-foreground-500"
        >
          <Icon icon="mdi:calendar-outline" className="h-3.5 w-3.5" />
        </span>
      ) : null,
      item.note ? (
        <span
          key="note"
          title="Has note"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-default-100 text-foreground-500"
        >
          <Icon icon="mdi:note-text-outline" className="h-3.5 w-3.5" />
        </span>
      ) : null,
      item.photoCount > 0 ? (
        <span
          key="photos"
          title={`${item.photoCount} ${item.photoCount === 1 ? "photo" : "photos"}`}
          className="inline-flex h-6 items-center gap-1 rounded-full bg-default-100 px-1.5 text-foreground-500"
        >
          <Icon icon="mdi:image-outline" className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold">{item.photoCount}</span>
        </span>
      ) : null,
      item.sharedGoals.length > 0 ? (
        <span
          key="shared"
          title={item.sharedGoals.map((goal) => goal.name).join(", ")}
          className="inline-flex h-6 items-center gap-1 rounded-full bg-[#A0D5D5]/30 px-1.5 text-[#2C5352]"
        >
          <Icon icon="mdi:account-group-outline" className="h-3.5 w-3.5" />
          {item.sharedGoals.length > 1 ? (
            <span className="text-[10px] font-semibold">
              {item.sharedGoals.length}
            </span>
          ) : null}
        </span>
      ) : null,
    ].filter(Boolean);

    if (badges.length === 0) return null;
    return <span className="mt-2 flex items-center gap-1.5">{badges}</span>;
  };

  const renderIncentiveRing = (item: GoalItem) => {
    if (!item.incentive) return null;

    const size = 48;
    const strokeWidth = 4;
    const center = size / 2;
    const radius = center - strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - item.incentive.progress);

    return (
      <span
        title={`${item.incentive.body}: ${item.incentive.completedDays}/${item.incentive.streakDays} days at ${item.incentive.streakPercent}% required`}
        className="relative flex h-14 w-14 shrink-0 items-center justify-center text-success-600"
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${item.incentive.completedDays} of ${item.incentive.streakDays} incentive days complete`}
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.16}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeWidth={strokeWidth}
            className="transition-all duration-500"
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center">
          <Icon icon="mdi:gift-outline" className="h-5 w-5" />
        </span>
        <span className="absolute -bottom-0.5 left-1/2 flex h-5 min-w-8 -translate-x-1/2 items-center justify-center rounded-full border border-default-200 bg-content1 px-1.5 text-[9px] font-bold tabular-nums text-foreground shadow-sm">
          {item.incentive.completedDays}/{item.incentive.streakDays}
        </span>
      </span>
    );
  };

  const renderGoalCard = (item: GoalItem) => {
    const cfg =
      DAY_VIEW_CATEGORY_CONFIG[item.categoryName] ??
      DEFAULT_DAY_VIEW_CATEGORY_CONFIG;
    const borderColor = item.isScheduled ? withAlpha(cfg.color, "66") : "";

    return (
      <button
        key={item.key}
        type="button"
        aria-label={`Open actions for ${item.label}`}
        onClick={() => openGoalActions(item)}
        className="grid min-h-[78px] w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-default-100 bg-content2/75 p-3 text-left transition-colors hover:bg-content2 sm:min-h-[92px] sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:p-4"
        style={{ borderColor: borderColor || undefined }}
      >
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm sm:h-14 sm:w-14"
          style={{
            backgroundColor: cfg.color,
            color: cfg.foregroundColor,
            boxShadow: `0 10px 24px ${withAlpha(cfg.color, "22")}`,
          }}
        >
          <Icon icon={item.icon} className="h-6 w-6 sm:h-7 sm:w-7" />
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground sm:text-base">
            {item.label}
          </span>
          {renderGoalBadges(item)}
        </span>
        {renderIncentiveRing(item)}
      </button>
    );
  };

  const renderCategoryGroup = (group: {
    key: string;
    categoryId: string;
    categoryName: string;
    categoryIcon: string;
    items: GoalItem[];
  }) => {
    const cfg =
      DAY_VIEW_CATEGORY_CONFIG[group.categoryName] ??
      DEFAULT_DAY_VIEW_CATEGORY_CONFIG;
    const isExpanded = expandedCategoryKey === group.key;
    const scheduledCount = group.items.filter(
      (item) => item.isScheduled,
    ).length;

    return (
      <div key={group.key} className="space-y-2">
        <button
          type="button"
          onClick={() => toggleCategory(group.key)}
          aria-expanded={isExpanded}
          className={cn(
            "flex w-full items-center gap-3 rounded-[18px] border bg-content1/70 px-3 py-3 text-left transition-colors hover:bg-content2",
            isExpanded ? "border-default-300" : "border-default-100",
          )}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: withAlpha(cfg.color, "18"),
              color: cfg.color,
            }}
          >
            <Icon icon={group.categoryIcon} className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">
              {group.categoryName}
            </span>
            <span className="block text-xs text-foreground-400">
              {group.items.length} {group.items.length === 1 ? "goal" : "goals"}
            </span>
          </span>
          {scheduledCount > 0 ? (
            <span className="flex h-7 items-center gap-1 rounded-full bg-default-100 px-2 text-xs font-medium text-foreground-500">
              <Icon icon="mdi:calendar-outline" className="h-3.5 w-3.5" />
              {scheduledCount}
            </span>
          ) : null}
          <Icon
            icon={
              isExpanded ? "fa7-solid:chevron-down" : "fa7-solid:chevron-right"
            }
            className="h-3 w-3 text-foreground-400"
          />
        </button>
        {isExpanded ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => renderGoalCard(item))}
          </div>
        ) : null}
      </div>
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

  const renderPrioritySection = ({
    priority,
    groups,
    itemCount,
  }: {
    priority: GoalPriorityStage;
    groups: Array<{
      key: string;
      categoryId: string;
      categoryName: string;
      categoryIcon: string;
      items: GoalItem[];
    }>;
    itemCount: number;
  }) => {
    const isOpen = openPriorities[priority];

    return (
      <div key={priority} className="space-y-2">
        <button
          type="button"
          onClick={() => togglePriority(priority)}
          aria-expanded={isOpen}
          className="flex w-full items-center gap-2 rounded-xl py-1.5 text-left text-[11px] font-semibold uppercase tracking-widest text-foreground-500 transition-colors hover:text-foreground sm:text-xs"
        >
          <Icon
            icon={isOpen ? "fa7-solid:chevron-down" : "fa7-solid:chevron-right"}
            className="h-3 w-3"
          />
          <span>{PRIORITY_LABELS[priority]}</span>
          <span className="ml-auto rounded-full bg-default-100 px-2 py-0.5 text-[11px] tracking-normal text-foreground-500">
            {itemCount}
          </span>
        </button>
        {isOpen ? (
          <div className="space-y-2">{groups.map(renderCategoryGroup)}</div>
        ) : null}
      </div>
    );
  };

  const renderCompletedGoalItem = (item: GoalItem) => {
    const cfg =
      DAY_VIEW_CATEGORY_CONFIG[item.categoryName] ??
      DEFAULT_DAY_VIEW_CATEGORY_CONFIG;

    return (
      <Tooltip key={item.key} content={item.label} color="foreground">
        <button
          type="button"
          aria-label={`Open actions for completed goal ${item.label}`}
          onClick={() => openGoalActions(item)}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-transparent shadow-sm transition-transform hover:-translate-y-0.5 sm:h-14 sm:w-14"
          style={{
            backgroundColor: cfg.color,
            color: cfg.foregroundColor,
            boxShadow: `0 10px 24px ${withAlpha(cfg.color, "22")}`,
          }}
        >
          <Icon icon={item.icon} className="h-5 w-5 sm:h-6 sm:w-6" />
          {item.note ? (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/75" />
          ) : null}
          {item.photoCount > 0 ? (
            <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-content1 text-foreground shadow-sm">
              <Icon icon="mdi:image-outline" className="h-3 w-3" />
            </span>
          ) : null}
          {item.isScheduled ? (
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-content1 text-foreground shadow-sm">
              <Icon icon="mdi:calendar-outline" className="h-3 w-3" />
            </span>
          ) : null}
        </button>
      </Tooltip>
    );
  };

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
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                radius="md"
                title="Previous day"
                aria-label="Previous day"
                className="h-8 w-8 shrink-0"
                onPress={() => onNavigateDay?.(-1)}
              >
                <ChevronLeftIcon />
              </Button>
              <h2 className="min-w-0 truncate text-xl font-semibold sm:mt-1 sm:text-2xl">
                {formatDayLabel(currentDate)}
              </h2>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                radius="md"
                title="Next day"
                aria-label="Next day"
                className="h-8 w-8 shrink-0"
                onPress={() => onNavigateDay?.(1)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              {dayScore.max > 0 ? (
                <div>
                  <div className="sm:hidden">
                    {renderDayScoreRings("compact")}
                  </div>
                  <div className="hidden sm:block">{renderDayScoreRings()}</div>
                </div>
              ) : null}
              <SettingsLink />
            </div>
          </div>
        </div>

        <div className="shrink-0 px-1 sm:px-0">
          <div className="grid gap-4">
            <div className="flex flex-col gap-3 sm:gap-5">
              {prioritySections.map(renderPrioritySection)}

              {(() => {
                const totalCompleted = completedItems.length;

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
                      className="flex w-full items-center gap-2 rounded-xl py-1.5 text-left text-[11px] font-semibold uppercase tracking-widest text-foreground-500 transition-colors hover:text-foreground sm:text-xs"
                    >
                      <Icon
                        icon={
                          showCompleted
                            ? "fa7-solid:chevron-down"
                            : "fa7-solid:chevron-right"
                        }
                        className="h-3 w-3"
                      />
                      Completed ({totalCompleted})
                    </button>
                    {showCompleted && (
                      <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:mt-3 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
                        {completedItems.map((item) =>
                          renderCompletedGoalItem(item),
                        )}
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
                            color: getReadableAccentColor(entry.color),
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
        isOpen={actionGoal != null}
        onOpenChange={(open) => {
          if (!open) {
            setActionGoal(null);
            setGoalPhotos([]);
          }
        }}
        placement="center"
        size="sm"
        classNames={{
          base: "mx-3 rounded-[24px] sm:mx-auto",
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 pb-2">
            <span className="line-clamp-2 text-base font-semibold leading-snug">
              {actionGoal?.label}
            </span>
            {actionGoal?.isScheduled ? (
              <span className="flex items-center gap-1 text-xs font-normal text-foreground-400">
                <Icon icon="mdi:calendar-outline" className="h-3.5 w-3.5" />
                {actionGoal.period && PERIOD_BADGE_LABELS[actionGoal.period]
                  ? PERIOD_BADGE_LABELS[actionGoal.period]
                  : "Scheduled goal"}
              </span>
            ) : null}
          </ModalHeader>
          <ModalBody className="gap-2 pb-4">
            <Button
              variant="flat"
              radius="lg"
              className="h-12 justify-start px-4 text-sm font-semibold"
              startContent={
                <Icon
                  icon={
                    actionGoal?.completed
                      ? "mdi:undo-variant"
                      : "mdi:check-circle-outline"
                  }
                  className="h-5 w-5"
                />
              }
              onPress={() => {
                actionGoal?.onToggle();
                setActionGoal(null);
              }}
            >
              {actionGoal?.completed ? "Mark incomplete" : "Mark complete"}
            </Button>
            <Button
              variant="flat"
              radius="lg"
              className="h-12 justify-start px-4 text-sm font-semibold"
              startContent={
                <Icon icon="mdi:note-text-outline" className="h-5 w-5" />
              }
              onPress={() => {
                const goal = actionGoal;
                setActionGoal(null);
                if (goal) openGoalNote(goal);
              }}
            >
              {actionGoal?.note ? "Show note" : "Add note"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                isDisabled={isUploadingGoalPhoto}
                isLoading={isUploadingGoalPhoto}
                variant="flat"
                radius="lg"
                className="h-12 justify-start px-4 text-sm font-semibold"
                startContent={
                  <Icon icon="mdi:camera-outline" className="h-5 w-5" />
                }
                onPress={() => cameraInputRef.current?.click()}
              >
                Take photo
              </Button>
              <Button
                isDisabled={isUploadingGoalPhoto}
                isLoading={isUploadingGoalPhoto}
                variant="flat"
                radius="lg"
                className="h-12 justify-start px-4 text-sm font-semibold"
                startContent={
                  <Icon icon="mdi:image-outline" className="h-5 w-5" />
                }
                onPress={() => libraryInputRef.current?.click()}
              >
                Add photo
              </Button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(event) => void handleGoalPhotoSelected(event)}
            />
            <input
              ref={libraryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void handleGoalPhotoSelected(event)}
            />
            {isLoadingGoalPhotos ? (
              <div className="flex h-20 items-center justify-center text-foreground-400">
                <Icon icon="mdi:loading" className="h-5 w-5 animate-spin" />
              </div>
            ) : goalPhotos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {goalPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative aspect-square overflow-hidden rounded-xl bg-default-100"
                  >
                    <img
                      src={photo.url}
                      alt={`Goal evidence from ${new Date(photo.createdAt).toLocaleDateString()}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Delete photo"
                      disabled={deletingGoalPhotoIds.has(photo.id)}
                      onClick={() => void handleDeleteGoalPhoto(photo.id)}
                      className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-danger disabled:opacity-50"
                    >
                      <Icon
                        icon={
                          deletingGoalPhotoIds.has(photo.id)
                            ? "mdi:loading"
                            : "mdi:trash-can-outline"
                        }
                        className={`h-4 w-4 ${
                          deletingGoalPhotoIds.has(photo.id)
                            ? "animate-spin"
                            : ""
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>

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
          <ModalFooter className="flex justify-end gap-2">
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
  dashboardMode = "embedded",
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
  const view = initialView;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
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
  const isDashboardStandalone = dashboardMode === "standalone";
  const showDashboardPanel = dashboardMode !== "hidden";
  const showCalendarPanel = dashboardMode !== "standalone";

  const [calSettings, setCalSettings] = useState<CalendarSettingsData>(
    DEFAULT_CALENDAR_SETTINGS,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<CalendarSettingsData>(
    DEFAULT_CALENDAR_SETTINGS,
  );

  useEffect(() => {
    if (dashboardMode !== "embedded") {
      setIsSidebarCollapsed(false);
      return;
    }

    setIsSidebarCollapsed(
      initialDashboardOpen
        ? false
        : window.matchMedia(MOBILE_SIDEBAR_MEDIA_QUERY).matches,
    );
  }, [dashboardMode, initialDashboardOpen]);

  useEffect(() => {
    fetchCalendarSettings()
      .then((s) => setCalSettings(s))
      .catch(() => {});
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

  const handleDayViewGoalPhotoCountChange = (
    goalId: string,
    dateKey: string,
    count: number,
  ) => {
    const key = `${goalId}_${dateKey}`;
    setGoalLogsSnapshot((snapshot) => {
      const photoCountsByGoalDate = { ...snapshot.photoCountsByGoalDate };

      if (count > 0) {
        photoCountsByGoalDate[key] = count;
      } else {
        delete photoCountsByGoalDate[key];
      }

      return { ...snapshot, photoCountsByGoalDate };
    });
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
      <div className="relative flex h-full w-full flex-col bg-content1 sm:rounded-2xl sm:border sm:border-default-200 sm:bg-default-100/80 sm:p-1 sm:shadow-sm">
        {view !== "day" ? (
          <SettingsLink
            className={cn(
              "absolute right-3 top-3 z-20",
              view === "month" && "hidden sm:flex",
            )}
          />
        ) : null}
        <Card className="mx-0 my-0 h-full min-h-0 w-full flex-1 overflow-hidden rounded-none border-0 bg-content1 shadow-none sm:rounded-[18px] sm:border sm:border-default-200 sm:bg-default-50 sm:shadow-small">
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {showDashboardPanel ? (
              <aside
                className={cn(
                  "border-divider bg-content1/70 flex w-full flex-col transition-all duration-200",
                  isDashboardStandalone
                    ? "min-h-0 flex-1 overflow-y-auto rounded-[14px] border p-4 sm:p-5"
                    : cn(
                        "border-b lg:shrink-0 lg:border-r lg:border-b-0",
                        isSidebarCollapsed
                          ? "items-end p-1.5 lg:w-14 lg:items-center lg:p-2"
                          : "p-3 lg:w-[250px]",
                      ),
                )}
              >
                {isSidebarCollapsed && !isDashboardStandalone ? (
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
                    {!isDashboardStandalone ? (
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
                    ) : null}

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
                                              icon={
                                                goal.iconKey || "mdi:circle"
                                              }
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
            ) : null}

            {showCalendarPanel ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-content1/40">
                {view === "month" ? (
                  <div className="flex items-center gap-1 px-3 pb-1 pt-3 sm:hidden">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      aria-label="Previous month"
                      title="Previous month"
                      className="h-9 w-9 min-w-9"
                      onPress={() => navigate(-1)}
                    >
                      <ChevronLeftIcon />
                    </Button>
                    <div className="min-w-0 flex-1 px-1">
                      <p className="truncate text-lg font-semibold text-[#2C5352]">
                        {formatMonthYear(currentDate)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="light"
                      className="h-9 min-w-0 px-2 text-[#2C5352]"
                      onPress={() => handleSelectDate(new Date())}
                    >
                      Today
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      aria-label="Next month"
                      title="Next month"
                      className="h-9 w-9 min-w-9"
                      onPress={() => navigate(1)}
                    >
                      <ChevronRightIcon />
                    </Button>
                    <SettingsLink className="h-9 w-9 rounded-xl shadow-none" />
                  </div>
                ) : null}
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
                        acceptedGoalIncentives={
                          goalLogsSnapshot.acceptedGoalIncentives
                        }
                        logsByGoalDate={allGoalLogsByDate}
                        notesByGoalDate={goalLogsSnapshot.notesByGoalDate}
                        photoCountsByGoalDate={
                          goalLogsSnapshot.photoCountsByGoalDate
                        }
                        onToggleGoalLog={handleDayViewToggleGoalLog}
                        onSaveGoalNote={handleDayViewSaveGoalNote}
                        onGoalPhotoCountChange={
                          handleDayViewGoalPhotoCountChange
                        }
                        onShareHabitResults={() =>
                          void handleShareHabitResults(currentDate)
                        }
                        onNavigateDay={(direction) => navigate(direction)}
                      />
                    )}
                  </div>
                </CardBody>
              </div>
            ) : null}
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
  initialView = "day",
}: Pick<
  PortableCalendarProps,
  "initialDate" | "initialCalendarData" | "initialView"
>) {
  return (
    <PortableCalendar
      title="Habit Calendar"
      initialView={initialView}
      initialDate={initialDate}
      initialCalendarData={initialCalendarData}
      dashboardMode="hidden"
    />
  );
}

export function Dashboard({
  initialDate,
  initialCalendarData,
}: Pick<PortableCalendarProps, "initialDate" | "initialCalendarData">) {
  return (
    <PortableCalendar
      title="Dashboard"
      initialView="day"
      initialDate={initialDate}
      initialCalendarData={initialCalendarData}
      allowCreate={false}
      dashboardMode="standalone"
    />
  );
}
