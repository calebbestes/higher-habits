import type { HabitVisibility } from "@/lib/habits-client";
import { mobileApiFetch } from "@/lib/mobile-api";

export type LinkedSharedGoal = {
  id: string;
  name: string;
  mode: "collaborative" | "competitive";
  friends?: Array<{
    userId: string;
    name: string;
    image: string | null;
  }>;
};

export type HabitInCategory = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
  goalId: string | null;
  goalTitle: string | null;
  priority: "high" | "low";
  hidden: boolean;
  visibility: HabitVisibility;
  period: "daily" | "weekly" | "monthly";
  frequencyGoal: number | null;
  defaultComplete: boolean;
  planOnCalendar: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
  sharedGoals?: LinkedSharedGoal[];
};

export type AcceptedHabitIncentive = {
  id: string;
  goalId: string;
  habitId: string;
  body: string;
  streakDays: number;
  streakPercent: number;
  createdAt: string;
};

export type HabitLogSocialComment = {
  id: string;
  userId: string;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
};

export type HabitLogSocialSummary = {
  props: {
    count: number;
    hasPropped: boolean;
  };
  comments: HabitLogSocialComment[];
};

export type CategoryWithHabits = {
  id: string;
  name: string;
  icon: string;
  habits: HabitInCategory[];
  goals: HabitInCategory[];
};

export type PeriodicHabitInfo = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
  goalId: string | null;
  goalTitle: string | null;
  priority: "high" | "low";
  visibility: HabitVisibility;
  period: "daily" | "weekly" | "monthly";
  frequencyGoal: number | null;
  repeatInterval: number | null;
  repeatDays: number[] | null;
  repeatMonthlyType: string | null;
  defaultComplete: boolean;
  planOnCalendar: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
  createdAt: string;
  sharedGoals?: LinkedSharedGoal[];
};

export type HabitLogsSnapshot = {
  categories: CategoryWithHabits[];
  periodicHabits: PeriodicHabitInfo[];
  acceptedHabitIncentives?: AcceptedHabitIncentive[];
  logsByHabitDate: Record<string, "complete" | "incomplete" | "planned">;
  completedCountsByHabitDate: Record<string, number>;
  notesByHabitDate: Record<string, string>;
  photoCountsByHabitDate: Record<string, number>;
  visibilityByHabitDate: Record<string, HabitVisibility>;
  plannedTimesByHabitDate: Record<
    string,
    { startTime: string | null; endTime: string | null; repeatsDaily: boolean }
  >;
  // Active "repeat daily" plan per habit, effective from originDate forward.
  repeatingPlansByHabit: Record<
    string,
    { startTime: string | null; endTime: string | null; originDate: string }
  >;
  // Dates (any status) that already have their own log per habit; an explicit
  // log for a date overrides the projected daily repeat for that date.
  explicitPlanDatesByHabit: Record<string, string[]>;
  socialByHabitDate: Record<string, HabitLogSocialSummary>;
};

export type HabitLogStatus = "complete" | "incomplete" | "planned" | null;

export type GoalInCategory = HabitInCategory;
export type AcceptedGoalIncentive = AcceptedHabitIncentive;
export type CategoryWithGoals = CategoryWithHabits;
export type PeriodicGoalInfo = PeriodicHabitInfo;
export type GoalLogsSnapshot = HabitLogsSnapshot;
export type GoalLogStatus = HabitLogStatus;
export type GoalLogSocialComment = HabitLogSocialComment;
export type GoalLogSocialSummary = HabitLogSocialSummary;

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(body?.error ?? body?.message ?? "Unable to continue.");
  }

  return response.json() as Promise<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function booleanOrFallback(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePriority(value: unknown): "high" | "low" {
  return value === "high" ? "high" : "low";
}

function normalizeDefaultComplete(value: unknown) {
  return value === true;
}

function normalizePlanOnCalendar(value: unknown) {
  return value !== false;
}

function mapValues<T>(
  value: unknown,
  normalizeValue: (value: unknown) => T | null,
): Record<string, T> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const normalized = normalizeValue(entry);
      return normalized === null ? [] : [[key, normalized]];
    }),
  );
}

function normalizeHabit<T extends Record<string, unknown>>(habit: T) {
  return {
    ...habit,
    defaultComplete: normalizeDefaultComplete(habit.defaultComplete),
    planOnCalendar: normalizePlanOnCalendar(habit.planOnCalendar),
    priority: normalizePriority(habit.priority),
  };
}

function normalizeHabits(value: unknown): HabitInCategory[] {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((habit) => normalizeHabit(habit) as HabitInCategory)
    : [];
}

function normalizeCategories(value: unknown): CategoryWithHabits[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((category) => {
        const habits = normalizeHabits(category.habits);
        return {
          ...category,
          habits,
          goals: habits,
        } as CategoryWithHabits;
      })
    : [];
}

function normalizeSnapshot(value: unknown): HabitLogsSnapshot {
  const payload = isRecord(value) ? value : {};
  const plannedTimesByHabitDate = mapValues(
    payload.plannedTimesByHabitDate,
    (entry) =>
      isRecord(entry)
        ? {
            startTime: nullableString(entry.startTime),
            endTime: nullableString(entry.endTime),
            repeatsDaily: booleanOrFallback(entry.repeatsDaily),
          }
        : null,
  );

  return {
    ...(payload as Partial<HabitLogsSnapshot>),
    categories: normalizeCategories(payload.categories),
    periodicHabits: Array.isArray(payload.periodicHabits)
      ? payload.periodicHabits
          .filter(isRecord)
          .map((habit) => normalizeHabit(habit) as PeriodicHabitInfo)
      : [],
    acceptedHabitIncentives: Array.isArray(payload.acceptedHabitIncentives)
      ? (payload.acceptedHabitIncentives as AcceptedHabitIncentive[])
      : [],
    logsByHabitDate: mapValues(payload.logsByHabitDate, (status) =>
      status === "complete" || status === "incomplete" || status === "planned"
        ? status
        : null,
    ),
    completedCountsByHabitDate: mapValues(
      payload.completedCountsByHabitDate,
      (count) =>
        typeof count === "number" && Number.isFinite(count) ? count : null,
    ),
    notesByHabitDate: mapValues(payload.notesByHabitDate, (note) =>
      typeof note === "string" ? note : null,
    ),
    photoCountsByHabitDate: mapValues(
      payload.photoCountsByHabitDate,
      (count) =>
        typeof count === "number" && Number.isFinite(count) ? count : null,
    ),
    visibilityByHabitDate: mapValues(
      payload.visibilityByHabitDate,
      (visibility) =>
        visibility === "only_me" ||
        visibility === "all_friends" ||
        visibility === "goal_friends"
          ? visibility
          : null,
    ),
    plannedTimesByHabitDate,
    repeatingPlansByHabit: isRecord(payload.repeatingPlansByHabit)
      ? (payload.repeatingPlansByHabit as HabitLogsSnapshot["repeatingPlansByHabit"])
      : {},
    explicitPlanDatesByHabit: isRecord(payload.explicitPlanDatesByHabit)
      ? (payload.explicitPlanDatesByHabit as Record<string, string[]>)
      : {},
    socialByHabitDate: isRecord(payload.socialByHabitDate)
      ? (payload.socialByHabitDate as HabitLogsSnapshot["socialByHabitDate"])
      : {},
  };
}

export function getMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const fetchHabitLogsSnapshot = (
  monthKey: string,
): Promise<HabitLogsSnapshot> =>
  mobileApiFetch(`/api/goal-logs?month=${monthKey}`)
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeSnapshot);

export const fetchAllHabitLogsSnapshot = (): Promise<HabitLogsSnapshot> =>
  mobileApiFetch(`/api/goal-logs?all=true&month=${getMonthKey()}`)
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeSnapshot);

export const setHabitLog = (
  habitId: string,
  dateKey: string,
  status: HabitLogStatus,
  options?: {
    completedCount?: number;
    endTime?: string | null;
    repeatPlan?: boolean;
    startTime?: string | null;
    timeZone?: string | null;
  },
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({
      type: "setLog",
      goalId: habitId,
      dateKey,
      status,
      ...(options
        ? {
            plannedStartTime: options.startTime ?? null,
            plannedEndTime: options.endTime ?? null,
            completedCount: options.completedCount,
            plannedTimeZone: options.timeZone ?? null,
            repeatPlan: options.repeatPlan ?? false,
          }
        : {}),
    }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const setHabitLogNote = (
  habitId: string,
  dateKey: string,
  notes: string,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({ type: "setNote", goalId: habitId, dateKey, notes }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const setHabitLogVisibility = (
  habitId: string,
  dateKey: string,
  visibility: HabitVisibility,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({
      type: "setVisibility",
      goalId: habitId,
      dateKey,
      visibility,
    }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const deleteHabitLog = (
  habitId: string,
  dateKey: string,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({ type: "deleteLog", goalId: habitId, dateKey }),
  }).then((r) => parseResponse<{ ok: true }>(r));
