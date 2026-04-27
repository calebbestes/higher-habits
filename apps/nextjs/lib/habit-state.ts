export const CALENDAR_HABIT_KEYS = ["prayer", "gym", "outreach"] as const;
export const SALES_CHANNEL_KEYS = ["call", "email", "dm", "meeting"] as const;
export const DRAWER_NOTE_KEYS = [
  "prayer",
  "gym",
  "outreach",
  "custom",
  "custom_0",
  "custom_1",
  "custom_2",
] as const;
export const CUSTOM_DAY_ICON_KEYS = [
  "tent",
  "heart",
  "party",
  "lunch",
  "phone",
  "financialPlanning",
  "firstAid",
  "temple",
  "book",
  "walk",
  "group",
  "climb",
  "tennis",
  "cook",
  "piano",
  "ministering",
  "czechCall",
] as const;
export const CUSTOM_DAY_ICON_STATUSES = ["planned", "complete"] as const;

export type CalendarHabitKey = (typeof CALENDAR_HABIT_KEYS)[number];
export type SalesChannelKey = (typeof SALES_CHANNEL_KEYS)[number];
export type DrawerNoteKey = (typeof DRAWER_NOTE_KEYS)[number];
export type CustomDayIconKey = (typeof CUSTOM_DAY_ICON_KEYS)[number];
export type CustomDayIconStatus = (typeof CUSTOM_DAY_ICON_STATUSES)[number];

export type PrayerChecklistState = {
  scriptures: boolean;
  prayer: boolean;
  cleanRoom: boolean;
  resistTemptation: boolean;
  noPhoneWalk: boolean;
};

export const EMPTY_PRAYER_CHECKLIST: PrayerChecklistState = {
  scriptures: false,
  prayer: false,
  cleanRoom: false,
  resistTemptation: false,
  noPhoneWalk: false,
};

export type WeightChecklistState = {
  gym: boolean;
  "meditate/stretch": boolean;
  calories2300: boolean;
  wakeUpAtSeven: boolean;
};

export const EMPTY_WEIGHT_CHECKLIST: WeightChecklistState = {
  gym: false,
  "meditate/stretch": false,
  calories2300: false,
  wakeUpAtSeven: false,
};

export type DayDrawerNotes = Record<DrawerNoteKey, string | null>;

export const EMPTY_DAY_DRAWER_NOTES: DayDrawerNotes = {
  prayer: null,
  gym: null,
  outreach: null,
  custom: null,
  custom_0: null,
  custom_1: null,
  custom_2: null,
};

export type CustomDayIconSelection = {
  iconKey: CustomDayIconKey;
  status: CustomDayIconStatus;
};

export type SalesActivityInput = {
  leadName: string;
  company: string;
  channel: SalesChannelKey;
  amount: number;
  notes?: string;
};

export type SalesActivityLog = {
  id: string;
  leadName: string;
  company: string;
  channel: SalesChannelKey;
  amount: number;
  notes: string;
  createdAt: string;
};

export type HabitStateMonthSnapshot = {
  month: string;
  dayHabits: Array<{
    dateKey: string;
    habitKey: CalendarHabitKey;
    isActive: boolean;
  }>;
  prayerChecklistsByDate: Record<string, PrayerChecklistState>;
  weightChecklistsByDate: Record<string, WeightChecklistState>;
  drawerNotesByDate: Record<string, DayDrawerNotes>;
  customDayIconsByDate: Record<string, CustomDayIconSelection | null>;
  salesByDate: Record<string, SalesActivityLog[]>;
};

export const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getMonthKey = (date: Date) => toDateKey(date).slice(0, 7);

export const parseMonthKey = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
};

export const getMonthDateRange = (monthKey: string) => {
  const monthStart = parseMonthKey(monthKey);
  const nextMonthStart = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    1,
  );

  return {
    startDateKey: toDateKey(monthStart),
    endDateKeyExclusive: toDateKey(nextMonthStart),
  };
};
