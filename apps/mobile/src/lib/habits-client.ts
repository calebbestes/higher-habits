import { mobileApiFetch } from "@/lib/mobile-api";
import { recordReviewMilestone } from "@/lib/in-app-review";

export type HabitPeriod = "daily" | "weekly" | "monthly";
export type HabitPriority = "high" | "low";
export type HabitVisibility = "only_me" | "goal_friends" | "all_friends";
export type HabitRepeatMonthlyType = "day_of_month" | "day_of_week";

export type Category = {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
};

export type Habit = {
  id: string;
  name: string;
  frequencyGoal: number | null;
  period: HabitPeriod;
  repeatCadence: HabitPeriod | null;
  repeatInterval: number | null;
  repeatDays: number[] | null;
  repeatMonthlyType: HabitRepeatMonthlyType | null;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  goalId: string | null;
  goalTitle: string | null;
  priority: HabitPriority;
  visibility: HabitVisibility;
  audienceFriendIds: string[];
  audienceGroupIds: string[];
  iconKey: string;
  defaultComplete: boolean;
  planOnCalendar: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
  reminderTimes: string[] | null;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HabitInput = {
  name: string;
  frequencyGoal: number | null;
  period: HabitPeriod;
  repeatCadence: HabitPeriod | null;
  repeatInterval: number | null;
  repeatDays: number[] | null;
  repeatMonthlyType: HabitRepeatMonthlyType | null;
  categoryId: string;
  goalId: string | null;
  priority: HabitPriority;
  visibility: HabitVisibility;
  audienceFriendIds: string[];
  audienceGroupIds: string[];
  iconKey: string;
  defaultComplete: boolean;
  planOnCalendar: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
  reminderTimes: string[] | null;
  hidden: boolean;
};

export type CategoryInput = {
  name: string;
  icon: string;
};

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

export const fetchHabits = () =>
  mobileApiFetch("/api/habits").then((response) =>
    parseResponse<Habit[]>(response),
  );

export const fetchCategories = () =>
  mobileApiFetch("/api/categories").then((response) =>
    parseResponse<Category[]>(response),
  );

export const createCategory = (input: CategoryInput) =>
  mobileApiFetch("/api/categories", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((response) => parseResponse<Category>(response));

export const updateCategory = (id: string, input: CategoryInput) =>
  mobileApiFetch("/api/categories", {
    method: "POST",
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((response) => parseResponse<Category>(response));

export const deleteCategory = (id: string) =>
  mobileApiFetch("/api/categories", {
    method: "POST",
    body: JSON.stringify({ type: "delete", id }),
  }).then((response) => parseResponse<{ ok: true }>(response));

export const createHabit = (input: HabitInput) =>
  mobileApiFetch("/api/habits", {
    method: "POST",
    body: JSON.stringify({ type: "create", ...input }),
  })
    .then((response) => parseResponse<Habit>(response))
    .then((habit) => {
      void recordReviewMilestone("habit");
      return habit;
    });

export const updateHabit = (id: string, input: HabitInput) =>
  mobileApiFetch("/api/habits", {
    method: "POST",
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((response) => parseResponse<Habit>(response));

export const deleteHabit = (id: string) =>
  mobileApiFetch("/api/habits", {
    method: "POST",
    body: JSON.stringify({ type: "deleteMany", ids: [id] }),
  }).then((response) => parseResponse<{ ok: true }>(response));
