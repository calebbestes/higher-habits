const GOALS_ENDPOINT = "/api/goals";
const CATEGORIES_ENDPOINT = "/api/categories";

export type GoalVisibility = "only_me" | "goal_friends" | "all_friends";

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
  period: "daily" | "weekly" | "monthly";
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  priority: "high" | "low";
  visibility: GoalVisibility;
  iconKey: string;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GoalInput = {
  name: string;
  frequencyGoal: number | null;
  period: "daily" | "weekly" | "monthly";
  categoryId: string;
  priority: string;
  visibility: GoalVisibility;
  iconKey: string;
  hidden: boolean;
};

export type CategoryInput = {
  name: string;
  icon: string;
};

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(text);
  }
  return res.json() as Promise<T>;
}

export const fetchCategories = (): Promise<Category[]> =>
  fetch(CATEGORIES_ENDPOINT, { cache: "no-store" }).then((r) =>
    parseResponse<Category[]>(r),
  );

export const fetchGoals = (): Promise<Goal[]> =>
  fetch(GOALS_ENDPOINT, { cache: "no-store" }).then((r) =>
    parseResponse<Goal[]>(r),
  );

export const createCategory = (input: CategoryInput): Promise<Category> =>
  fetch(CATEGORIES_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((r) => parseResponse<Category>(r));

export const createGoal = (input: GoalInput): Promise<Goal> =>
  fetch(GOALS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "create", ...input }),
  }).then((r) => parseResponse<Goal>(r));

export const updateGoal = (id: string, input: GoalInput): Promise<Goal> =>
  fetch(GOALS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((r) => parseResponse<Goal>(r));

export const deleteManyGoals = (ids: string[]): Promise<{ ok: true }> =>
  fetch(GOALS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "deleteMany", ids }),
  }).then((r) => parseResponse<{ ok: true }>(r));
