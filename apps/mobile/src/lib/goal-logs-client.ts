import type { GoalVisibility } from "@/lib/goals-client";
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

export type GoalInCategory = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
  goalId: string | null;
  goalTitle: string | null;
  priority: "high" | "low";
  hidden: boolean;
  visibility: GoalVisibility;
  audienceFriendIds: string[];
  audienceGroupIds: string[];
  period: "daily" | "weekly" | "monthly";
  frequencyGoal: number | null;
  repeatCadence: "daily" | "weekly" | "monthly" | null;
  defaultComplete: boolean;
  planOnCalendar: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
  reminderTimes?: string[] | null;
  sharedGoals?: LinkedSharedGoal[];
};

export type AcceptedGoalIncentive = {
  id: string;
  goalId: string;
  body: string;
  streakDays: number;
  streakPercent: number;
  createdAt: string;
};

export type GoalLogSocialComment = {
  id: string;
  userId: string;
  parentCommentId: string | null;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
  replies: GoalLogSocialComment[];
};

export type GoalLogSocialSummary = {
  goalLogId: string;
  props: {
    count: number;
    hasPropped: boolean;
  };
  comments: GoalLogSocialComment[];
};

export type CategoryWithGoals = {
  id: string;
  name: string;
  icon: string;
  goals: GoalInCategory[];
};

export type PeriodicGoalInfo = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
  goalId: string | null;
  goalTitle: string | null;
  priority: "high" | "low";
  visibility: GoalVisibility;
  audienceFriendIds: string[];
  audienceGroupIds: string[];
  period: "daily" | "weekly" | "monthly";
  frequencyGoal: number | null;
  repeatCadence: "daily" | "weekly" | "monthly" | null;
  repeatInterval: number | null;
  repeatDays: number[] | null;
  repeatMonthlyType: string | null;
  defaultComplete: boolean;
  planOnCalendar: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
  reminderTimes?: string[] | null;
  createdAt: string;
  sharedGoals?: LinkedSharedGoal[];
};

export type GoalLogsSnapshot = {
  categories: CategoryWithGoals[];
  periodicGoals: PeriodicGoalInfo[];
  acceptedGoalIncentives?: AcceptedGoalIncentive[];
  logsByGoalDate: Record<string, "complete" | "incomplete" | "planned">;
  completedCountsByGoalDate: Record<string, number>;
  notesByGoalDate: Record<string, string>;
  photoCountsByGoalDate: Record<string, number>;
  visibilityByGoalDate: Record<string, GoalVisibility>;
  plannedTimesByGoalDate: Record<
    string,
    { startTime: string | null; endTime: string | null; repeatsDaily: boolean }
  >;
  socialByGoalDate: Record<string, GoalLogSocialSummary>;
};

export type GoalLogStatus = "complete" | "incomplete" | "planned" | null;

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

function normalizeGoal<T extends Record<string, unknown>>(goal: T) {
  return {
    ...goal,
    audienceFriendIds: Array.isArray(goal.audienceFriendIds)
      ? goal.audienceFriendIds.filter((id) => typeof id === "string")
      : [],
    audienceGroupIds: Array.isArray(goal.audienceGroupIds)
      ? goal.audienceGroupIds.filter((id) => typeof id === "string")
      : [],
    defaultComplete: normalizeDefaultComplete(goal.defaultComplete),
    planOnCalendar: normalizePlanOnCalendar(goal.planOnCalendar),
    priority: normalizePriority(goal.priority),
  };
}

function normalizeGoals(value: unknown): GoalInCategory[] {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((goal) => normalizeGoal(goal) as GoalInCategory)
    : [];
}

function normalizeCategories(value: unknown): CategoryWithGoals[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((category) => {
        const goals = normalizeGoals(category.goals ?? category.habits);
        return { ...category, goals } as CategoryWithGoals;
      })
    : [];
}

function normalizeSocialComment(value: unknown): GoalLogSocialComment | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    ...(value as Partial<GoalLogSocialComment>),
    id: value.id,
    userId: typeof value.userId === "string" ? value.userId : "",
    parentCommentId: nullableString(value.parentCommentId),
    authorName:
      typeof value.authorName === "string" && value.authorName.trim()
        ? value.authorName
        : "Friend",
    authorImage: nullableString(value.authorImage),
    body: typeof value.body === "string" ? value.body : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    canDelete: booleanOrFallback(value.canDelete),
    replies: Array.isArray(value.replies)
      ? value.replies.flatMap((reply) => {
          const normalized = normalizeSocialComment(reply);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeSocialSummary(value: unknown): GoalLogSocialSummary | null {
  if (!isRecord(value)) return null;

  return {
    ...(value as Partial<GoalLogSocialSummary>),
    goalLogId: typeof value.goalLogId === "string" ? value.goalLogId : "",
    props: {
      count:
        isRecord(value.props) &&
        typeof value.props.count === "number" &&
        Number.isFinite(value.props.count)
          ? value.props.count
          : 0,
      hasPropped:
        isRecord(value.props) && booleanOrFallback(value.props.hasPropped),
    },
    comments: Array.isArray(value.comments)
      ? value.comments.flatMap((comment) => {
          const normalized = normalizeSocialComment(comment);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeSnapshot(value: unknown): GoalLogsSnapshot {
  const payload = isRecord(value) ? value : {};

  return {
    ...(payload as Partial<GoalLogsSnapshot>),
    categories: normalizeCategories(payload.categories),
    periodicGoals: Array.isArray(payload.periodicGoals)
      ? payload.periodicGoals
          .filter(isRecord)
          .map((goal) => normalizeGoal(goal) as PeriodicGoalInfo)
      : [],
    acceptedGoalIncentives: Array.isArray(payload.acceptedGoalIncentives)
      ? (payload.acceptedGoalIncentives as AcceptedGoalIncentive[])
      : [],
    logsByGoalDate: mapValues(payload.logsByGoalDate, (status) =>
      status === "complete" || status === "incomplete" || status === "planned"
        ? status
        : null,
    ),
    completedCountsByGoalDate: mapValues(
      payload.completedCountsByGoalDate,
      (count) =>
        typeof count === "number" && Number.isFinite(count) ? count : null,
    ),
    notesByGoalDate: mapValues(payload.notesByGoalDate, (note) =>
      typeof note === "string" ? note : null,
    ),
    photoCountsByGoalDate: mapValues(payload.photoCountsByGoalDate, (count) =>
      typeof count === "number" && Number.isFinite(count) ? count : null,
    ),
    visibilityByGoalDate: mapValues(
      payload.visibilityByGoalDate,
      (visibility) =>
        visibility === "only_me" ||
        visibility === "all_friends" ||
        visibility === "goal_friends"
          ? visibility
          : null,
    ),
    plannedTimesByGoalDate: mapValues(
      payload.plannedTimesByGoalDate,
      (entry) =>
        isRecord(entry)
          ? {
              startTime: nullableString(entry.startTime),
              endTime: nullableString(entry.endTime),
              repeatsDaily: booleanOrFallback(entry.repeatsDaily),
            }
          : null,
    ),
    socialByGoalDate: mapValues(
      payload.socialByGoalDate,
      normalizeSocialSummary,
    ),
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

export const fetchGoalLogsSnapshot = (
  monthKey: string,
): Promise<GoalLogsSnapshot> =>
  mobileApiFetch(`/api/goal-logs?month=${monthKey}`)
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeSnapshot);

export const fetchAllGoalLogsSnapshot = (): Promise<GoalLogsSnapshot> =>
  mobileApiFetch(`/api/goal-logs?all=true&month=${getMonthKey()}`)
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeSnapshot);

export const setGoalLog = (
  goalId: string,
  dateKey: string,
  status: GoalLogStatus,
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
      goalId,
      dateKey,
      status,
      completedCount: options?.completedCount,
      plannedStartTime: options?.startTime ?? null,
      plannedEndTime: options?.endTime ?? null,
      plannedTimeZone: options?.timeZone ?? null,
      repeatPlan: options?.repeatPlan ?? false,
    }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const setGoalLogNote = (
  goalId: string,
  dateKey: string,
  notes: string,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({ type: "setNote", goalId, dateKey, notes }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const setGoalLogVisibility = (
  goalId: string,
  dateKey: string,
  visibility: GoalVisibility,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({
      type: "setVisibility",
      goalId,
      dateKey,
      visibility,
    }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const deleteGoalLog = (
  goalId: string,
  dateKey: string,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({ type: "deleteLog", goalId, dateKey }),
  }).then((r) => parseResponse<{ ok: true }>(r));
