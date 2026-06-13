import { mobileApiFetch } from "@/lib/mobile-api";

export type GoalPeriod = "daily" | "weekly" | "monthly";
export type GoalPriority = "high" | "low";
export type GoalVisibility = "only_me" | "goal_friends" | "all_friends";
export type GoalRepeatMonthlyType = "day_of_month" | "day_of_week";

export type Category = {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
};

export type Goal = {
  id: string;
  name: string;
  frequencyGoal: number | null;
  period: GoalPeriod;
  repeatInterval: number | null;
  repeatDays: number[] | null;
  repeatMonthlyType: GoalRepeatMonthlyType | null;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  priority: GoalPriority;
  visibility: GoalVisibility;
  iconKey: string;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GoalInput = {
  name: string;
  frequencyGoal: number | null;
  period: GoalPeriod;
  repeatInterval: number | null;
  repeatDays: number[] | null;
  repeatMonthlyType: GoalRepeatMonthlyType | null;
  categoryId: string;
  priority: GoalPriority;
  visibility: GoalVisibility;
  iconKey: string;
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

export const fetchGoals = () =>
  mobileApiFetch("/api/goals").then((response) =>
    parseResponse<Goal[]>(response),
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

export const createGoal = (input: GoalInput) =>
  mobileApiFetch("/api/goals", {
    method: "POST",
    body: JSON.stringify({ type: "create", ...input }),
  }).then((response) => parseResponse<Goal>(response));

export const updateGoal = (id: string, input: GoalInput) =>
  mobileApiFetch("/api/goals", {
    method: "POST",
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((response) => parseResponse<Goal>(response));

export const deleteGoal = (id: string) =>
  mobileApiFetch("/api/goals", {
    method: "POST",
    body: JSON.stringify({ type: "deleteMany", ids: [id] }),
  }).then((response) => parseResponse<{ ok: true }>(response));
