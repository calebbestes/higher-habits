import { mobileApiFetch } from "@/lib/mobile-api";

export type Task = {
  id: string;
  name: string;
  importance: string;
  dueDate: string | null;
  completedAt: string | null;
  timeRequired: string;
  projectId: string | null;
  createdAt: string;
};

export type TaskInput = {
  name: string;
  importance: string;
  dueDate: string | null;
  completedAt: string | null;
  timeRequired: string;
  projectId: string | null;
};

export type TaskUrgency = "today" | "soon" | "later";

export const TASK_IMPORTANCES = ["High", "Medium", "Low"] as const;
export const TASK_URGENCIES = ["today", "soon", "later"] as const;
export const TASK_TIME_OPTIONS = [
  "~30 min",
  "~1 hr",
  "Multiple hours",
] as const;

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const IMPORTANCE_SCORE: Record<string, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

const URGENCY_SCORE: Record<TaskUrgency, number> = {
  today: 3,
  soon: 2,
  later: 1,
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

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export const todayDateKey = localDateKey;

export function isValidTaskDateKey(dateKey: string): boolean {
  if (!DATE_KEY_REGEX.test(dateKey)) return false;

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  return localDateKey(date);
}

export function getTaskUrgency(
  task: Pick<Task, "dueDate">,
  today = todayDateKey(),
): TaskUrgency {
  if (!task.dueDate) return "later";
  if (task.dueDate <= today) return "today";
  return task.dueDate <= addDaysToDateKey(today, 7) ? "soon" : "later";
}

export function getTaskDueDateForUrgency(
  urgency: TaskUrgency,
  today = todayDateKey(),
): string | null {
  if (urgency === "today") return today;
  if (urgency === "soon") return addDaysToDateKey(today, 7);
  return null;
}

export function getTaskImportanceScore(importance: string): number {
  return IMPORTANCE_SCORE[importance] ?? 1;
}

export function getTaskUrgencyScore(urgency: TaskUrgency): number {
  return URGENCY_SCORE[urgency];
}

export function compareTasksByPriority(
  a: Task,
  b: Task,
  today: string,
): number {
  const priorityCompare =
    getTaskPriorityLevel(b, today) - getTaskPriorityLevel(a, today);
  if (priorityCompare !== 0) return priorityCompare;

  const importanceCompare =
    getTaskImportanceScore(b.importance) - getTaskImportanceScore(a.importance);
  if (importanceCompare !== 0) return importanceCompare;

  const urgencyCompare =
    getTaskUrgencyScore(getTaskUrgency(b, today)) -
    getTaskUrgencyScore(getTaskUrgency(a, today));
  if (urgencyCompare !== 0) return urgencyCompare;

  const aDueDate = a.dueDate ?? "9999-99-99";
  const bDueDate = b.dueDate ?? "9999-99-99";
  const dueDateCompare = aDueDate < bDueDate ? -1 : aDueDate > bDueDate ? 1 : 0;
  if (dueDateCompare !== 0) return dueDateCompare;

  const createdCompare = b.createdAt.localeCompare(a.createdAt);
  return createdCompare !== 0 ? createdCompare : a.name.localeCompare(b.name);
}

export function getTaskPriorityLevel(
  task: Pick<Task, "importance" | "dueDate">,
  today = todayDateKey(),
): number {
  const score =
    ((IMPORTANCE_SCORE[task.importance] ?? 1) +
      URGENCY_SCORE[getTaskUrgency(task, today)]) /
    2;

  return Math.max(1, Math.min(3, score));
}

export const fetchTasks = (today = todayDateKey()) =>
  mobileApiFetch(`/api/tasks?today=${today}`).then((response) =>
    parseResponse<Task[]>(response),
  );

export const createTask = (input: TaskInput) =>
  mobileApiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ type: "create", ...input }),
  }).then((response) => parseResponse<Task>(response));

export const updateTask = (id: string, input: TaskInput) =>
  mobileApiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((response) => parseResponse<Task>(response));

export const deleteTask = (id: string) =>
  mobileApiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ type: "deleteMany", ids: [id] }),
  }).then((response) => parseResponse<{ ok: true }>(response));
