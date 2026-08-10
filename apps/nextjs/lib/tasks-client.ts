const ENDPOINT = "/api/tasks";

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
};

export type TaskRecurrence = "none" | "daily" | "weekly" | "monthly";
export type TaskUrgency = "today" | "soon" | "later";
export type TaskPriorityLevel = number;

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

function dateFromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function compareDateKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function getTaskDateWeekday(dateKey: string | null): number | null {
  if (!dateKey) return null;
  return dateFromDateKey(dateKey).getDay();
}

function getTaskDateMonthDay(dateKey: string | null): number | null {
  if (!dateKey) return null;
  return dateFromDateKey(dateKey).getDate();
}

function getNextWeekdayDateKey(
  weekday: number,
  fromDateKey = todayDateKey(),
  includeFromDate = true,
): string {
  const fromDate = dateFromDateKey(fromDateKey);
  let dayDelta = (weekday - fromDate.getDay() + 7) % 7;
  if (!includeFromDate && dayDelta === 0) dayDelta = 7;
  return addDaysToDateKey(fromDateKey, dayDelta);
}

function getNextMonthDayDateKey(
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

function getTaskRecurrenceWeekdays(
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

function getTaskRecurrenceMonthDays(
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

function getNextWeekdaysDateKey(
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

function getNextMonthDaysDateKey(
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
  };
}

export function nextRecurringTaskInput(
  task: Task,
  completedAt = todayDateKey(),
): TaskInput | null {
  if (task.recurrence === "none") return null;

  const baseDate =
    task.dueDate && compareDateKeys(task.dueDate, completedAt) > 0
      ? task.dueDate
      : completedAt;
  const dueDate =
    task.recurrence === "daily"
      ? addDaysToDateKey(baseDate, 1)
      : task.recurrence === "weekly"
        ? getNextWeekdaysDateKey(
            getTaskRecurrenceWeekdays(task),
            baseDate,
            false,
          )
        : getNextMonthDaysDateKey(
            getTaskRecurrenceMonthDays(task),
            baseDate,
            false,
          );

  return {
    ...taskToInput(task),
    completedAt: null,
    dueDate,
  };
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

export const deleteManyTasks = (ids: string[]): Promise<{ ok: true }> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "deleteMany", ids }),
  }).then((r) => parseResponse<{ ok: true }>(r));
