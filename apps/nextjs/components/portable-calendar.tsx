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
import {
  PRAYER_CHECKLIST_ITEMS,
  PrayerChecklistDrawer,
} from "./prayer-checklist-drawer";
import { SALES_CHECKLIST_ITEMS, SalesOutreachDrawer } from "./sales-outreach-drawer";
import {
  WEIGHT_CHECKLIST_ITEMS,
  WeightChecklistDrawer,
} from "./weight-checklist-drawer";

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
  { key: "prayer", label: "Prayer", icon: "mdi:hands-pray" },
  { key: "gym", label: "Weights", icon: "mdi:dumbbell" },
  { key: "outreach", label: "Sales/Outreach", icon: "mdi:currency-usd" },
] as const;

const cn = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

const toDate = (value?: Date | string | number) => {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value);
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
    return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
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
            "absolute inset-0 h-full w-full text-violet-600",
            fillClassName,
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
    fillClassName="text-sky-600"
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
    fillClassName="text-amber-600"
  />
);

const SearchIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" role="img" aria-label="Search">
    <title>Search</title>
    <circle cx="8.5" cy="8.5" r="5.5" />
    <path d="m13 13 4 4" strokeLinecap="round" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" role="img" aria-label="Previous">
    <title>Previous</title>
    <path d="m12.5 4.5-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" role="img" aria-label="Next">
    <title>Next</title>
    <path d="m7.5 4.5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" role="img" aria-label="Close">
    <title>Close</title>
    <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" role="img" aria-label="Add">
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
    title={`${entry.title} • ${entry.category.name} • ${formatEntryTiming(entry)}`}
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
  onCustomDayIconsByDateChange,
  onPrayerChecklistsByDateChange,
  onWeightChecklistsByDateChange,
  onSalesChecklistsByDateChange,
}: {
  currentDate: Date;
  selectedDate: Date;
  entries: NormalizedCalendarEntry[];
  onSelectDate: (date: Date) => void;
  onSelectEntry: (entry: NormalizedCalendarEntry) => void;
  onCustomDayIconsByDateChange?: (data: Record<string, CustomDayIconSelection | null>) => void;
  onPrayerChecklistsByDateChange?: (data: Record<string, PrayerChecklistState>) => void;
  onWeightChecklistsByDateChange?: (data: Record<string, WeightChecklistState>) => void;
  onSalesChecklistsByDateChange?: (data: Record<string, SalesChecklistState>) => void;
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

  useEffect(() => {
    let cancelled = false;

    const loadMonthSnapshot = async () => {
      try {
        const snapshot = await fetchHabitMonthSnapshot(currentMonthKey);

        if (cancelled) {
          return;
        }

        setActiveHabitIcons((previous) => {
          const next = new Set(
            [...previous].filter(
              (key) => !key.startsWith(`${currentMonthKey}-`),
            ),
          );

          for (const habit of snapshot.dayHabits) {
            if (habit.isActive) {
              next.add(getHabitStateKey(habit.dateKey, habit.habitKey));
            }
          }

          return next;
        });

        setPrayerChecklistsByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) => !dateKey.startsWith(currentMonthKey),
            ),
          ),
          ...snapshot.prayerChecklistsByDate,
        }));

        setCustomDayIconsByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) => !dateKey.startsWith(currentMonthKey),
            ),
          ),
          ...snapshot.customDayIconsByDate,
        }));

        setWeightChecklistsByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) => !dateKey.startsWith(currentMonthKey),
            ),
          ),
          ...snapshot.weightChecklistsByDate,
        }));

        setDrawerNotesByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) => !dateKey.startsWith(currentMonthKey),
            ),
          ),
          ...snapshot.drawerNotesByDate,
        }));

        setSalesChecklistsByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) => !dateKey.startsWith(currentMonthKey),
            ),
          ),
          ...snapshot.salesChecklistsByDate,
        }));

        setSalesByDate((previous) => ({
          ...Object.fromEntries(
            Object.entries(previous).filter(
              ([dateKey]) => !dateKey.startsWith(currentMonthKey),
            ),
          ),
          ...snapshot.salesByDate,
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
  }, [currentMonthKey]);

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
    const slotIndex = parseInt(slotKey.slice(lastUnderscore + 1), 10);

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
                      {DAY_HABIT_ICONS.map((habitIcon) => {
                        const iconKey = getHabitStateKey(
                          toDateKey(date),
                          habitIcon.key,
                        );
                        const prayerProgress =
                          habitIcon.key === "prayer"
                            ? getPrayerProgress(date)
                            : 0;
                        const weightProgress =
                          habitIcon.key === "gym" ? getWeightProgress(date) : 0;
                        const salesProgress =
                          habitIcon.key === "outreach" ? getSalesProgress(date) : 0;
                        const prayerDrawerOpen = prayerDrawerDate
                          ? isSameDay(prayerDrawerDate, date)
                          : false;
                        const weightDrawerOpen = weightDrawerDate
                          ? isSameDay(weightDrawerDate, date)
                          : false;
                        const salesDrawerOpen = salesDrawerDate
                          ? isSameDay(salesDrawerDate, date)
                          : false;
                        const isActive =
                          habitIcon.key === "prayer"
                            ? prayerProgress > 0 || prayerDrawerOpen
                            : habitIcon.key === "gym"
                              ? weightProgress > 0 || weightDrawerOpen
                              : habitIcon.key === "outreach"
                                ? salesProgress > 0 || salesDrawerOpen
                                : activeHabitIcons.has(iconKey);

                        return (
                          <button
                            type="button"
                            key={`${habitIcon.key}-${toDateKey(date)}`}
                            title={habitIcon.label}
                            aria-label={habitIcon.label}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleHabitIconClick(date, habitIcon.key);
                            }}
                            className={cn(
                              "inline-flex h-10 w-10 items-center justify-center rounded-xl border text-[9px] transition-all",
                              habitIcon.key === "prayer" && "col-start-1 row-start-1",
                              habitIcon.key === "gym" && "col-start-2 row-start-1",
                              habitIcon.key === "outreach" && "col-start-1 row-start-2",
                              isActive
                                ? "border-default-300 bg-content1 text-foreground-700 opacity-100"
                                : "border-default-200/40 bg-content1/40 text-foreground-300 opacity-30",
                            )}
                          >
                            {habitIcon.key === "prayer" ? (
                              <PrayerProgressIcon
                                progress={prayerProgress}
                                className="h-6 w-6"
                              />
                            ) : habitIcon.key === "gym" ? (
                              <WeightProgressIcon
                                progress={weightProgress}
                                className="h-6 w-6"
                              />
                            ) : (
                              <SalesProgressIcon
                                progress={salesProgress}
                                className="h-6 w-6"
                              />
                            )}
                          </button>
                        );
                      })}

                      {([0, 1, 2] as const).map((slotIdx) => {
                        const selectedCustomIcon = getCustomDayIcon(date, slotIdx);
                        const isThisSlotOpen = iconPickerDate
                          ? isSameDay(iconPickerDate, date) && iconPickerSlot === slotIdx
                          : false;

                        const gridClass =
                          slotIdx === 0
                            ? "col-start-1 row-start-3"
                            : slotIdx === 1
                              ? "col-start-2 row-start-2"
                              : "col-start-2 row-start-3";

                        return (
                          <button
                            type="button"
                            key={`custom-${slotIdx}-${toDateKey(date)}`}
                            title="Choose day icon"
                            aria-label="Choose day icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenIconPicker(date, slotIdx);
                            }}
                            className={cn(
                              "inline-flex h-10 w-10 items-center justify-center rounded-xl border text-[9px] transition-all",
                              gridClass,
                              selectedCustomIcon?.status === "complete"
                                ? "border-sky-200 bg-sky-50/90 text-sky-600 opacity-100"
                                : selectedCustomIcon?.status === "planned"
                                  ? "border-slate-300 bg-slate-50/90 text-slate-500 opacity-100"
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
                                fillClassName="text-sky-600"
                              />
                            ) : (
                              <Icon
                                icon={selectedCustomIcon?.option.icon ?? "mdi:plus"}
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
                                    key={`${entry.id}-overflow-${date.toISOString()}`}
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

      <PrayerChecklistDrawer
        prayerDrawerDate={prayerDrawerDate}
        checklistsByDate={prayerChecklistsByDate}
        notes={prayerDrawerDate ? getDrawerNotes(toDateKey(prayerDrawerDate)).prayer : null}
        onChecklistChange={handlePrayerChecklistChange}
        onNotesChange={(dateKey, nextNotes) =>
          handleDrawerNoteChange(dateKey, "prayer", nextNotes)
        }
        onClose={() => {
          setPrayerDrawerDate(null);
        }}
      />

      <WeightChecklistDrawer
        weightDrawerDate={weightDrawerDate}
        checklistsByDate={weightChecklistsByDate}
        notes={weightDrawerDate ? getDrawerNotes(toDateKey(weightDrawerDate)).gym : null}
        onChecklistChange={handleWeightChecklistChange}
        onNotesChange={(dateKey, nextNotes) =>
          handleDrawerNoteChange(dateKey, "gym", nextNotes)
        }
        onClose={() => {
          setWeightDrawerDate(null);
        }}
      />

      <SalesOutreachDrawer
        salesDrawerDate={salesDrawerDate}
        salesByDate={salesByDate}
        checklistsByDate={salesChecklistsByDate}
        notes={salesDrawerDate ? getDrawerNotes(toDateKey(salesDrawerDate)).outreach : null}
        onChecklistChange={handleSalesChecklistChange}
        onSaveActivity={handleSaveSalesActivity}
        onNotesChange={(dateKey, nextNotes) =>
          handleDrawerNoteChange(dateKey, "outreach", nextNotes)
        }
        onClose={() => {
          setSalesDrawerDate(null);
        }}
      />

      <DayIconPickerDrawer
        iconPickerDate={iconPickerDate}
        slotIndex={iconPickerSlot}
        selectedIconsByDate={customDayIconsByDate}
        notes={iconPickerDate ? (getDrawerNotes(toDateKey(iconPickerDate))[`custom_${iconPickerSlot}` as "custom_0" | "custom_1" | "custom_2"] ?? null) : null}
        onIconChange={handleCustomDayIconChange}
        onNotesChange={(dateKey, nextNotes) =>
          handleDrawerNoteChange(dateKey, `custom_${iconPickerSlot}` as "custom_0" | "custom_1" | "custom_2", nextNotes)
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

const DayView = ({
  currentDate,
  entries,
  onSelectEntry,
}: {
  currentDate: Date;
  entries: NormalizedCalendarEntry[];
  onSelectEntry: (entry: NormalizedCalendarEntry) => void;
}) => {
  const dayEntries = useMemo(
    () =>
      entries
        .filter((entry) => isDateInEntryRange(currentDate, entry))
        .sort(compareEntries),
    [currentDate, entries],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="bg-content1 border-divider rounded-3xl border p-5">
        <p className="text-foreground-500 text-xs uppercase tracking-[0.14em]">
          Selected day
        </p>
        <h2 className="mt-1 text-2xl font-semibold">
          {formatDayLabel(currentDate)}
        </h2>
      </div>

      <div className="bg-content1 border-divider min-h-0 flex-1 rounded-3xl border p-5">
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
          <div className="text-foreground-500 flex h-full items-center justify-center rounded-[20px] border border-dashed border-default-200 text-sm">
            No entries on this day.
          </div>
        )}
      </div>
    </div>
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
  >({});
  const [goalsCollapsed, setGoalsCollapsed] = useState(false);
  const [dailyGoalsCollapsed, setDailyGoalsCollapsed] = useState(false);
  const [monthViewPrayerChecklists, setMonthViewPrayerChecklists] = useState<Record<string, PrayerChecklistState>>({});
  const [monthViewWeightChecklists, setMonthViewWeightChecklists] = useState<Record<string, WeightChecklistState>>({});
  const [monthViewSalesChecklists, setMonthViewSalesChecklists] = useState<Record<string, SalesChecklistState>>({});

  const goalMetrics = useMemo(() => {
    const monthKey = getMonthKey(currentDate);
    return CUSTOM_DAY_ICON_OPTIONS.map((opt) => {
        const targetCount =
          opt.frequency === "monthly" ? 1 : opt.frequency === "biweekly" ? 2 : 4;
        const completedCount = Object.entries(monthViewIconsByDate).reduce(
          (n, [dateKey, sel]) =>
            dateKey.startsWith(monthKey) &&
            sel?.iconKey === opt.key &&
            sel.status === "complete"
              ? n + 1
              : n,
          0,
        );
        return { opt, completedCount, targetCount, ratio: completedCount / targetCount };
      })
      .sort((a, b) =>
        a.ratio !== b.ratio
          ? b.ratio - a.ratio
          : a.targetCount - b.targetCount,
      );
  }, [monthViewIconsByDate, currentDate]);

  const dailyGoalMetrics = useMemo(() => {
    const monthKey = getMonthKey(currentDate);
    const today = toDateKey(new Date());
    const monthEnd = `${monthKey}-31`;
    const lastDate = today < monthEnd ? today : monthEnd;
    const msPerDay = 86400000;

    type ChecklistItem = { key: string; label: string; icon: string };

    const itemsWithSource: Array<{ item: ChecklistItem; byDate: Record<string, Record<string, boolean>> }> = [
      ...PRAYER_CHECKLIST_ITEMS.map((item) => ({
        item: item as ChecklistItem,
        byDate: monthViewPrayerChecklists as Record<string, Record<string, boolean>>,
      })),
      ...WEIGHT_CHECKLIST_ITEMS.map((item) => ({
        item: item as ChecklistItem,
        byDate: monthViewWeightChecklists as Record<string, Record<string, boolean>>,
      })),
      ...SALES_CHECKLIST_ITEMS.map((item) => ({
        item: item as ChecklistItem,
        byDate: monthViewSalesChecklists as Record<string, Record<string, boolean>>,
      })),
    ];

    return itemsWithSource
      .map(({ item, byDate }) => {
        const completedDateKeys = Object.entries(byDate)
          .filter(([dateKey, state]) => dateKey.startsWith(monthKey) && state[item.key])
          .map(([dateKey]) => dateKey)
          .sort();
        const completedCount = completedDateKeys.length;
        if (completedCount === 0) return { item, ratio: 0 };
        const firstDate = completedDateKeys[0];
        const end = new Date(lastDate > firstDate ? lastDate : firstDate);
        const totalDays = Math.round((end.getTime() - new Date(firstDate).getTime()) / msPerDay) + 1;
        return { item, ratio: completedCount / totalDays };
      })
      .sort((a, b) => b.ratio - a.ratio);
  }, [monthViewPrayerChecklists, monthViewWeightChecklists, monthViewSalesChecklists, currentDate]);

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
      const haystack =
        `${entry.title} ${entry.notes ?? ""} ${entry.category.name}`.toLowerCase();
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
        case "1":
          setView("month");
          break;
        case "2":
          setView("week");
          break;
        case "3":
          setView("day");
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
      <div className="w-full rounded-2xl border border-default-200 bg-default-100/80 p-1 shadow-sm">
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
                        icon={goalsCollapsed ? "mdi:chevron-right" : "mdi:chevron-down"}
                        className="ml-auto h-3.5 w-3.5 text-foreground-400"
                      />
                    </button>
                    {!goalsCollapsed && (
                      <div className="mt-2 space-y-1.5">
                        {goalMetrics.map(({ opt, completedCount, targetCount, ratio }) => (
                          <div key={opt.key} className="flex items-center gap-2">
                            <Tooltip content={opt.label} placement="right" size="sm">
                              <span className="shrink-0 cursor-default">
                                <Icon icon={opt.icon} className="h-4 w-4 text-foreground-500" />
                              </span>
                            </Tooltip>
                            <div className="min-w-0 flex-1">
                              <div className="h-2 overflow-hidden rounded-full bg-default-200">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${Math.min(ratio, 1) * 100}%` }}
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
                        {formatMonthYear(currentDate)} Daily Goal %
                      </span>
                      <Icon
                        icon={dailyGoalsCollapsed ? "mdi:chevron-right" : "mdi:chevron-down"}
                        className="ml-auto h-3.5 w-3.5 text-foreground-400"
                      />
                    </button>
                    {!dailyGoalsCollapsed && (
                      <div className="mt-2 space-y-1.5">
                        {dailyGoalMetrics.map(({ item, ratio }) => (
                          <div key={item.key} className="flex items-center gap-2">
                            <Tooltip content={item.label} placement="right" size="sm">
                              <span className="shrink-0 cursor-default">
                                <Icon icon={item.icon} className="h-4 w-4 text-foreground-500" />
                              </span>
                            </Tooltip>
                            <div className="min-w-0 flex-1">
                              <div className="h-2 overflow-hidden rounded-full bg-default-200">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                                />
                              </div>
                            </div>
                            <span className="shrink-0 text-[10px] tabular-nums text-foreground-400">
                              {Math.round(ratio * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
                      onCustomDayIconsByDateChange={setMonthViewIconsByDate}
                      onPrayerChecklistsByDateChange={setMonthViewPrayerChecklists}
                      onWeightChecklistsByDateChange={setMonthViewWeightChecklists}
                      onSalesChecklistsByDateChange={setMonthViewSalesChecklists}
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
                      currentDate={currentDate}
                      entries={visibleEntries}
                      onSelectEntry={handleSelectEntry}
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

export function MonthCalendar() {
  return <PortableCalendar title="Habit Calendar" />;
}
