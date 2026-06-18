const HABITS_ENDPOINT = "/api/habits";
const CATEGORIES_ENDPOINT = "/api/categories";

export type HabitVisibility = "only_me" | "goal_friends" | "all_friends";

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
  period: "daily" | "weekly" | "monthly";
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  goalId: string | null;
  goalTitle: string | null;
  priority: "high" | "low";
  visibility: HabitVisibility;
  iconKey: string;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HabitInput = {
  name: string;
  frequencyGoal: number | null;
  period: "daily" | "weekly" | "monthly";
  categoryId: string;
  goalId?: string | null;
  priority: string;
  visibility: HabitVisibility;
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

export const fetchHabits = (): Promise<Habit[]> =>
  fetch(HABITS_ENDPOINT, { cache: "no-store" }).then((r) =>
    parseResponse<Habit[]>(r),
  );

export const createCategory = (input: CategoryInput): Promise<Category> =>
  fetch(CATEGORIES_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((r) => parseResponse<Category>(r));

export const createHabit = (input: HabitInput): Promise<Habit> =>
  fetch(HABITS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "create", ...input }),
  }).then((r) => parseResponse<Habit>(r));

export const updateHabit = (id: string, input: HabitInput): Promise<Habit> =>
  fetch(HABITS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((r) => parseResponse<Habit>(r));

export const deleteManyHabits = (ids: string[]): Promise<{ ok: true }> =>
  fetch(HABITS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "deleteMany", ids }),
  }).then((r) => parseResponse<{ ok: true }>(r));
