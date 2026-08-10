import { mobileApiFetch } from "@/lib/mobile-api";
import { recordReviewMilestone } from "@/lib/in-app-review";

export type Task = {
  id: string;
  name: string;
  importance: string;
  dueDate: string | null;
  completedAt: string | null;
  timeRequired: string;
  recurrence: TaskRecurrence;
  recurrenceWeekday: number | null;
  recurrenceMonthDay: number | null;
  recurrenceWeekdays: number[] | null;
  recurrenceMonthDays: number[] | null;
  projectId: string | null;
  createdAt: string;
};

export type TaskInput = {
  name: string;
  importance: string;
  dueDate: string | null;
  completedAt: string | null;
  timeRequired: string;
  recurrence: TaskRecurrence;
  recurrenceWeekday: number | null;
  recurrenceMonthDay: number | null;
  recurrenceWeekdays: number[];
  recurrenceMonthDays: number[];
  projectId: string | null;
};

export type TaskRecurrence = "none" | "daily" | "weekly" | "monthly";
export type TaskUrgency = "today" | "soon" | "later";

export const TASK_IMPORTANCES = ["High", "Medium", "Low"] as const;
export const TASK_URGENCIES = ["today", "soon", "later"] as const;
export const TASK_RECURRENCES: Array<{
  label: string;
  value: TaskRecurrence;
}> = [
  { label: "None", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];
export const TASK_TIME_OPTIONS = [
  "~30 min",
  "~1 hr",
  "Multiple hours",
] as const;
export const TASK_WEEKDAY_OPTIONS = [
  { label: "S", value: 0 },
  { label: "M", value: 1 },
  { label: "T", value: 2 },
  { label: "W", value: 3 },
  { label: "Th", value: 4 },
  { label: "F", value: 5 },
  { label: "S", value: 6 },
] as const;
export const TASK_MONTH_DAY_OPTIONS = Array.from(
  { length: 31 },
  (_, index) => index + 1,
);

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

function dateFromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function compareDateKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function getTaskDateWeekday(dateKey: string | null): number | null {
  if (!dateKey || !isValidTaskDateKey(dateKey)) return null;
  return dateFromDateKey(dateKey).getDay();
}

export function getTaskDateMonthDay(dateKey: string | null): number | null {
  if (!dateKey || !isValidTaskDateKey(dateKey)) return null;
  return dateFromDateKey(dateKey).getDate();
}

export function getNextWeekdayDateKey(
  weekday: number,
  fromDateKey = todayDateKey(),
  includeFromDate = true,
): string {
  const fromDate = dateFromDateKey(fromDateKey);
  let dayDelta = (weekday - fromDate.getDay() + 7) % 7;
  if (!includeFromDate && dayDelta === 0) dayDelta = 7;
  return addDaysToDateKey(fromDateKey, dayDelta);
}

export function getNextMonthDayDateKey(
  monthDay: number,
  fromDateKey = todayDateKey(),
  includeFromDate = true,
): string {
  const fromDate = dateFromDateKey(fromDateKey);
  const candidate = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const lastDay = new Date(
    candidate.getFullYear(),
    candidate.getMonth() + 1,
    0,
  ).getDate();
  candidate.setDate(Math.min(monthDay, lastDay));

  if (!includeFromDate && localDateKey(candidate) <= fromDateKey) {
    candidate.setMonth(candidate.getMonth() + 1, 1);
  } else if (includeFromDate && localDateKey(candidate) < fromDateKey) {
    candidate.setMonth(candidate.getMonth() + 1, 1);
  }

  const nextLastDay = new Date(
    candidate.getFullYear(),
    candidate.getMonth() + 1,
    0,
  ).getDate();
  candidate.setDate(Math.min(monthDay, nextLastDay));

  return localDateKey(candidate);
}

function uniqueSortedNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

export function getTaskRecurrenceWeekdays(
  task: Pick<Task, "dueDate" | "recurrenceWeekday"> & {
    recurrenceWeekdays?: number[] | null;
  },
): number[] {
  const days = uniqueSortedNumbers(
    (task.recurrenceWeekdays ?? []).filter(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6,
    ),
  );
  if (days.length) return days;

  const fallback = task.recurrenceWeekday ?? getTaskDateWeekday(task.dueDate);
  return fallback == null ? [] : [fallback];
}

export function getTaskRecurrenceMonthDays(
  task: Pick<Task, "dueDate" | "recurrenceMonthDay"> & {
    recurrenceMonthDays?: number[] | null;
  },
): number[] {
  const days = uniqueSortedNumbers(
    (task.recurrenceMonthDays ?? []).filter(
      (day) => Number.isInteger(day) && day >= 1 && day <= 31,
    ),
  );
  if (days.length) return days;

  const fallback = task.recurrenceMonthDay ?? getTaskDateMonthDay(task.dueDate);
  return fallback == null ? [] : [fallback];
}

export function getNextWeekdaysDateKey(
  weekdays: number[],
  fromDateKey = todayDateKey(),
  includeFromDate = true,
): string {
  const candidates = weekdays.length ? weekdays : [0];
  return candidates
    .map((weekday) =>
      getNextWeekdayDateKey(weekday, fromDateKey, includeFromDate),
    )
    .sort(compareDateKeys)[0];
}

export function getNextMonthDaysDateKey(
  monthDays: number[],
  fromDateKey = todayDateKey(),
  includeFromDate = true,
): string {
  const candidates = monthDays.length ? monthDays : [1];
  return candidates
    .map((monthDay) =>
      getNextMonthDayDateKey(monthDay, fromDateKey, includeFromDate),
    )
    .sort(compareDateKeys)[0];
}

export function getNextRecurringTaskDueDate(
  task: Pick<
    Task,
    | "dueDate"
    | "recurrence"
    | "recurrenceMonthDay"
    | "recurrenceMonthDays"
    | "recurrenceWeekday"
    | "recurrenceWeekdays"
  >,
  completedAt = todayDateKey(),
): string | null {
  if (task.recurrence === "none") return null;

  const baseDate =
    task.dueDate && compareDateKeys(task.dueDate, completedAt) > 0
      ? task.dueDate
      : completedAt;
  if (task.recurrence === "daily") return addDaysToDateKey(baseDate, 1);
  if (task.recurrence === "weekly") {
    return getNextWeekdaysDateKey(
      getTaskRecurrenceWeekdays(task),
      baseDate,
      false,
    );
  }

  return getNextMonthDaysDateKey(
    getTaskRecurrenceMonthDays(task),
    baseDate,
    false,
  );
}

export function taskToInput(task: Task): TaskInput {
  return {
    name: task.name,
    importance: task.importance,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    timeRequired: task.timeRequired,
    recurrence: task.recurrence,
    recurrenceWeekday: task.recurrenceWeekday,
    recurrenceMonthDay: task.recurrenceMonthDay,
    recurrenceWeekdays: getTaskRecurrenceWeekdays(task),
    recurrenceMonthDays: getTaskRecurrenceMonthDays(task),
    projectId: task.projectId,
  };
}

export function nextRecurringTaskInput(
  task: Task,
  completedAt = todayDateKey(),
): TaskInput | null {
  const dueDate = getNextRecurringTaskDueDate(task, completedAt);
  if (!dueDate) return null;

  return {
    ...taskToInput(task),
    completedAt: null,
    dueDate,
  };
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
  })
    .then((response) => parseResponse<Task>(response))
    .then((task) => {
      void recordReviewMilestone("task");
      return task;
    });

export const updateTask = (id: string, input: TaskInput) =>
  mobileApiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((response) => parseResponse<Task>(response));

export async function updateTaskCompletion(
  task: Task,
  completedAt: string | null,
): Promise<{ nextTask: Task | null; task: Task }> {
  const updated = await updateTask(task.id, {
    ...taskToInput(task),
    completedAt,
  });
  const nextInput =
    task.completedAt || !completedAt
      ? null
      : nextRecurringTaskInput(task, completedAt);
  const nextTask = nextInput ? await createTask(nextInput) : null;

  return { nextTask, task: updated };
}

export const deleteTask = (id: string) =>
  mobileApiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ type: "deleteMany", ids: [id] }),
  }).then((response) => parseResponse<{ ok: true }>(response));
