const ENDPOINT = "/api/tasks";

export type Task = {
  id: string;
  name: string;
  importance: string;
  dueDate: string | null;
  completedAt: string | null;
  timeRequired: string;
  createdAt: string;
};

export type TaskInput = {
  name: string;
  importance: string;
  dueDate: string | null;
  completedAt: string | null;
  timeRequired: string;
};

export type TaskUrgency = "today" | "soon" | "later";
export type TaskPriorityLevel = number;

export const TASK_IMPORTANCES = ["High", "Medium", "Low"] as const;
export const TASK_URGENCIES = ["today", "soon", "later"] as const;

const IMPORTANCE_SCORE: Record<string, TaskPriorityLevel> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

const URGENCY_SCORE: Record<TaskUrgency, TaskPriorityLevel> = {
  today: 3,
  soon: 2,
  later: 1,
};

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(text);
  }
  return res.json() as Promise<T>;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export const todayDateKey = localDateKey;

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  return localDateKey(date);
}

export function getTaskImportanceScore(importance: string): TaskPriorityLevel {
  return IMPORTANCE_SCORE[importance] ?? 1;
}

export function getTaskUrgency(
  task: Pick<Task, "dueDate">,
  today = todayDateKey(),
): TaskUrgency {
  if (!task.dueDate) {
    return "later";
  }

  if (task.dueDate <= today) {
    return "today";
  }

  return task.dueDate <= addDaysToDateKey(today, 7) ? "soon" : "later";
}

export function getTaskUrgencyScore(urgency: TaskUrgency): TaskPriorityLevel {
  return URGENCY_SCORE[urgency];
}

export function getTaskDueDateForUrgency(
  urgency: TaskUrgency,
  today = todayDateKey(),
): string | null {
  if (urgency === "today") {
    return today;
  }

  if (urgency === "soon") {
    return addDaysToDateKey(today, 7);
  }

  return null;
}

export function getTaskPriorityLevel(
  task: Pick<Task, "importance" | "dueDate">,
  today = todayDateKey(),
): TaskPriorityLevel {
  const score =
    (getTaskImportanceScore(task.importance) +
      getTaskUrgencyScore(getTaskUrgency(task, today))) /
    2;

  return Math.max(1, Math.min(3, score));
}

export const fetchTasks = (): Promise<Task[]> =>
  fetch(`${ENDPOINT}?today=${todayDateKey()}`, { cache: "no-store" }).then(
    (r) => parseResponse<Task[]>(r),
  );

export const createTask = (input: TaskInput): Promise<Task> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "create", ...input }),
  }).then((r) => parseResponse<Task>(r));

export const updateTask = (id: string, input: TaskInput): Promise<Task> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((r) => parseResponse<Task>(r));

export const deleteManyTasks = (ids: string[]): Promise<{ ok: true }> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "deleteMany", ids }),
  }).then((r) => parseResponse<{ ok: true }>(r));
