export { MonthCalendar, PortableCalendar } from "./portable-calendar";
export type {
  PortableCalendarCategory,
  PortableCalendarEntry
} from "./portable-calendar";

/*
"use client";

import {
    Button,
    Card,
    CardBody,
    CardHeader,
    Chip,
    Input,
    Tab,
    Tabs,
} from "@heroui/react";
import { useEffect, useMemo, useState } from "react";

type CalendarView = "month" | "week" | "day";

export type PortableCalendarEntry = {
  id: string;
  title: string;
  start: Date | string | number;
  end?: Date | string | number;
  color?: string;
  notes?: string;
};

type NormalizedCalendarEntry = Omit<PortableCalendarEntry, "start" | "end"> & {
  start: Date;
  end: Date;
};

type PortableCalendarProps = {
  entries?: PortableCalendarEntry[];
  initialDate?: Date | string | number;
  initialView?: CalendarView;
  title?: string;
  onDateSelect?: (date: Date) => void;
  onEntrySelect?: (entry: PortableCalendarEntry) => void;
};

type MiniCalendarCell = {
  date: Date;
  isOutside: boolean;
  isToday: boolean;
  isSelected: boolean;
};

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
const COMPACT_DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

const cn = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

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

const formatMonthYear = (date: Date) =>
  `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;

const formatDayLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

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

const normalizeEntry = (entry: PortableCalendarEntry): NormalizedCalendarEntry => {
  const start = toDate(entry.start);
  const rawEnd = entry.end ? toDate(entry.end) : new Date(start);
  const end = rawEnd.getTime() >= start.getTime() ? rawEnd : new Date(start);

  return {
    ...entry,
    start,
    end,
    color: entry.color ?? "#3b82f6",
  };
};

const compareEntries = (a: NormalizedCalendarEntry, b: NormalizedCalendarEntry) =>
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
  return Array.from({ length: 6 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(gridStart, weekIndex * 7 + dayIndex);
      return {
        date,
        isOutside: !isSameMonth(date, currentDate),
      };
    }),
  );
};

const buildMiniCalendarCells = (
  currentDate: Date,
  selectedDate: Date,
): MiniCalendarCell[] => {
  const monthStart = startOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      isOutside: !isSameMonth(date, currentDate),
      isToday: isToday(date),
      isSelected: isSameDay(date, selectedDate),
    };
  });
};

const titleForView = (view: CalendarView, currentDate: Date) => {
  switch (view) {
    case "day":
      return formatDayLabel(currentDate);
    case "week":
      return formatWeekRange(currentDate);
    case "month":
    default:
      return formatMonthYear(currentDate);
  }
};

const navigateDate = (date: Date, view: CalendarView, direction: number) => {
  switch (view) {
    case "day":
      return addDays(date, direction);
    case "week":
      return addWeeks(date, direction);
    case "month":
    default:
      return addMonths(date, direction);
  }
};

const SearchIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    fill="none"
    className="h-4 w-4"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <circle cx="8.5" cy="8.5" r="5.5" />
    <path d="m13 13 4 4" strokeLinecap="round" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    fill="none"
    className="h-4 w-4"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="m12.5 4.5-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    fill="none"
    className="h-4 w-4"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="m7.5 4.5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    fill="none"
    className="h-4 w-4"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
  </svg>
);

const CalendarBar = ({
  entry,
  onPress,
}: {
  entry: NormalizedCalendarEntry;
  onPress: () => void;
}) => (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      onPress();
    }}
    className="w-full rounded-md px-2 py-1 text-left text-xs font-medium text-white transition-transform hover:scale-[1.01]"
    style={{
      backgroundColor: entry.color,
    }}
    title={`${entry.title} • ${formatEntryTiming(entry)}`}
  >
    <span className="line-clamp-1">{entry.title}</span>
  </button>
);

const MiniCalendar = ({
  currentDate,
  selectedDate,
  onSelectDate,
}: {
  currentDate: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) => {
  const cells = useMemo(
    () => buildMiniCalendarCells(currentDate, selectedDate),
    [currentDate, selectedDate],
  );

  return (
    <div className="border-divider mt-4 border-t pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{formatMonthYear(currentDate)}</span>
      </div>
      <div className="text-foreground-500 grid grid-cols-7 gap-1 text-center text-[11px]">
        {COMPACT_DAY_NAMES.map((dayName, index) => (
          <span key={`${dayName}-${index}`}>{dayName}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((cell) => (
          <button
            type="button"
            key={`mini-${cell.date.toISOString()}`}
            onClick={() => onSelectDate(cell.date)}
            className={cn(
              "h-7 rounded-md text-xs transition-colors",
              cell.isSelected
                ? "bg-primary text-primary-foreground"
                : cell.isToday
                  ? "border-primary text-primary border"
                  : "hover:bg-default-100",
              cell.isOutside && !cell.isSelected && "text-foreground-400",
            )}
          >
            {cell.date.getDate()}
          </button>
        ))}
      </div>
    </div>
  );
};

const MonthView = ({
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
  const weeks = useMemo(() => buildMonthWeeks(currentDate), [currentDate]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-foreground-500 grid grid-cols-7 gap-px px-1 pb-2 text-center text-xs font-medium">
        {DAY_NAMES.map((dayName) => (
          <div key={dayName} className="py-2">
            {dayName}
          </div>
        ))}
      </div>

      <div className="bg-divider grid flex-1 grid-cols-1 gap-px overflow-hidden rounded-xl">
        {weeks.map((week, weekIndex) => (
          <div key={`week-${weekIndex}`} className="grid min-h-0 flex-1 grid-cols-7 gap-px">
            {week.map(({ date, isOutside }) => {
              const dayEntries = entries
                .filter((entry) => isDateInEntryRange(date, entry))
                .sort(compareEntries);
              const visibleEntries = dayEntries.slice(0, 3);
              const hiddenCount = Math.max(0, dayEntries.length - 3);

              return (
                <button
                  type="button"
                  key={date.toISOString()}
                  onClick={() => onSelectDate(date)}
                  className={cn(
                    "bg-content1 hover:bg-default-50 min-h-36 min-w-0 p-2 text-left transition-colors",
                    isOutside && "bg-content2/20",
                    isSameDay(date, selectedDate) && "ring-primary ring-2 ring-inset",
                  )}
                >
                  <div className="mb-2 flex justify-end">
                    <span
                      className={cn(
                        "text-xs font-medium sm:text-sm",
                        isOutside && "text-foreground-400",
                        isToday(date) &&
                          "bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full",
                      )}
                    >
                      {date.getDate()}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {visibleEntries.map((entry) => (
                      <CalendarBar
                        key={`${entry.id}-${date.toISOString()}`}
                        entry={entry}
                        onPress={() => onSelectEntry(entry)}
                      />
                    ))}
                    {hiddenCount > 0 ? (
                      <div className="text-foreground-500 px-1 pt-1 text-xs font-medium">
                        +{hiddenCount} more
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
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
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-7">
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
              "bg-content1 border-divider hover:bg-default-50 min-h-72 min-w-0 rounded-xl border p-3 text-left transition-colors",
              isSameDay(date, selectedDate) && "ring-primary ring-2",
            )}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-foreground-500 text-xs uppercase tracking-wide">
                  {DAY_NAMES[date.getDay()]}
                </p>
                <p className="text-lg font-semibold">{date.getDate()}</p>
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
                  <div
                    key={`${entry.id}-${date.toISOString()}`}
                    className="rounded-lg border border-transparent p-2 transition-colors hover:border-default-200"
                  >
                    <CalendarBar
                      entry={entry}
                      onPress={() => onSelectEntry(entry)}
                    />
                    <p className="text-foreground-500 mt-1 text-xs">
                      {formatEntryTiming(entry)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-foreground-500 rounded-lg border border-dashed border-default-200 px-3 py-6 text-center text-sm">
                  No entries
                </div>
              )}
            </div>
          </button>
        );
      })}
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
      <div className="bg-content1 border-divider rounded-xl border p-4">
        <p className="text-foreground-500 text-xs uppercase tracking-wide">
          Selected day
        </p>
        <h2 className="mt-1 text-xl font-semibold">{formatDayLabel(currentDate)}</h2>
      </div>

      <div className="bg-content1 border-divider min-h-0 flex-1 rounded-xl border p-4">
        {dayEntries.length > 0 ? (
          <div className="space-y-3">
            {dayEntries.map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() => onSelectEntry(entry)}
                className="hover:bg-default-50 flex w-full items-start gap-3 rounded-xl border border-default-200 p-3 text-left transition-colors"
              >
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-semibold">{entry.title}</p>
                    <span className="text-foreground-500 text-xs whitespace-nowrap">
                      {formatEntryTiming(entry)}
                    </span>
                  </div>
                  {entry.notes ? (
                    <p className="text-foreground-500 mt-1 text-sm">{entry.notes}</p>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-foreground-500 flex h-full items-center justify-center rounded-xl border border-dashed border-default-200 text-sm">
            No entries on this day.
          </div>
        )}
      </div>
    </div>
  );
};

export const PortableCalendar = ({
  entries = [],
  initialDate,
  initialView = "month",
  title = "Calendar",
  onDateSelect,
  onEntrySelect,
}: PortableCalendarProps) => {
  const resolvedInitialDate = useMemo(
    () => startOfDay(toDate(initialDate)),
    [initialDate],
  );
  const [currentDate, setCurrentDate] = useState(resolvedInitialDate);
  const [selectedDate, setSelectedDate] = useState(resolvedInitialDate);
  const [view, setView] = useState<CalendarView>(initialView);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedEntries = useMemo(
    () => entries.map(normalizeEntry).sort(compareEntries),
    [entries],
  );

  const selectedDateEntries = useMemo(
    () =>
      normalizedEntries.filter((entry) =>
        isDateInEntryRange(selectedDate, entry),
      ),
    [normalizedEntries, selectedDate],
  );

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return normalizedEntries.filter((entry) => {
      const haystack = `${entry.title} ${entry.notes ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [normalizedEntries, searchQuery]);

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
    if (view === "day") {
      setSelectedDate(next);
    }
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
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentDate, view]);

  return (
    <Card className="mx-0 my-0 h-full min-h-0 w-full flex-1">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside
          className={cn(
            "border-divider bg-content2/20 flex w-full flex-col border-b transition-all duration-200 lg:shrink-0 lg:border-r lg:border-b-0",
            isSidebarCollapsed
              ? "items-center p-2 lg:w-16"
              : "p-4 lg:w-72",
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

              <div className="mt-4 flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto">
                {selectedDateEntries.slice(0, 4).map((entry) => (
                  <span
                    key={entry.id}
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                    title={entry.title}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold">{title}</p>
                  <p className="text-foreground-500 text-xs">
                    {selectedDateEntries.length} on selected day
                  </p>
                </div>
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

              <MiniCalendar
                currentDate={currentDate}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
              />

              <div className="mt-4 flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {formatDayLabel(selectedDate)}
                  </p>
                  {isToday(selectedDate) ? (
                    <Chip color="primary" size="sm" variant="flat">
                      Today
                    </Chip>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {selectedDateEntries.length > 0 ? (
                    selectedDateEntries.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        onClick={() => handleSelectEntry(entry)}
                        className="hover:bg-default-50 w-full rounded-xl border border-default-200 p-3 text-left transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="mt-1 h-3 w-3 shrink-0 rounded-full"
                            style={{
                              backgroundColor: entry.color,
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {entry.title}
                            </p>
                            <p className="text-foreground-500 mt-1 text-xs">
                              {formatEntryTiming(entry)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="text-foreground-500 rounded-xl border border-dashed border-default-200 px-3 py-6 text-center text-sm">
                      Nothing scheduled.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <CardHeader className="flex flex-col items-start justify-between gap-4 pb-4 sm:flex-row sm:items-center">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Tabs
                size="sm"
                selectedKey={view}
                onSelectionChange={(key) =>
                  setView(key as CalendarView)
                }
              >
                <Tab key="month" title="Month" />
                <Tab key="week" title="Week" />
                <Tab key="day" title="Day" />
              </Tabs>

              <div>
                <p className="text-sm font-semibold">
                  {titleForView(view, currentDate)}
                </p>
                <p className="text-foreground-500 text-xs">
                  1 month, 2 week, 3 day
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
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
                    className="w-56"
                    autoFocus
                  />
                  {searchQuery.length > 0 ? (
                    <div className="bg-content1 shadow-medium rounded-medium border-divider absolute top-full right-0 z-50 mt-2 w-72 border p-2">
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
                              className="hover:bg-default-100 flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors"
                            >
                              <span
                                className="mt-1 h-3 w-3 shrink-0 rounded-full"
                                style={{
                                  backgroundColor:
                                    entry.color,
                                }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {entry.title}
                                </span>
                                <span className="text-foreground-500 block text-xs">
                                  {formatDayLabel(
                                    entry.start,
                                  )}
                                </span>
                              </span>
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
                  variant="ghost"
                  onPress={() => setIsSearchExpanded(true)}
                  title="Search entries"
                >
                  <SearchIcon />
                </Button>
              )}

              <Button
                isIconOnly
                size="sm"
                variant="ghost"
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
                variant="ghost"
                onPress={() => navigate(1)}
                title={`Next ${view}`}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </CardHeader>

          <CardBody className="min-h-0 flex-1 p-3 sm:p-6">
            <div className="flex min-h-0 flex-1 flex-col">
              {view === "month" ? (
                <MonthView
                  currentDate={currentDate}
                  selectedDate={selectedDate}
                  entries={normalizedEntries}
                  onSelectDate={handleSelectDate}
                  onSelectEntry={handleSelectEntry}
                />
              ) : view === "week" ? (
                <WeekView
                  currentDate={currentDate}
                  selectedDate={selectedDate}
                  entries={normalizedEntries}
                  onSelectDate={handleSelectDate}
                  onSelectEntry={handleSelectEntry}
                />
              ) : (
                <DayView
                  currentDate={currentDate}
                  entries={normalizedEntries}
                  onSelectEntry={handleSelectEntry}
                />
              )}
            </div>
          </CardBody>
        </div>
      </div>
    </Card>
  );
};

export function MonthCalendar() {
  return <PortableCalendar title="Habit Calendar" />;
}

*/
