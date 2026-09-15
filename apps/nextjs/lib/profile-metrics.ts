type ProfileHabit = {
  id: string;
};

type ProfileHabitLog = {
  goalId: string;
  date: string;
  status: "complete" | "incomplete" | "planned";
};

type ProfileCompletionDate = Date | string | null | undefined;

function mountainDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateKeyToUtcDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`);
}

function addDays(dateKey: string, days: number) {
  const date = dateKeyToUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function completionDateKey(date: ProfileCompletionDate) {
  if (!date) return null;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return null;
  return mountainDateKey(parsed);
}

export function getLongestProfileStreak(
  habits: ProfileHabit[],
  logs: ProfileHabitLog[],
  completionDates: ProfileCompletionDate[] = [],
) {
  const logsByHabitDate = new Map(
    logs.map((log) => [`${log.goalId}_${log.date}`, log.status]),
  );
  const completionDateKeys = new Set(
    completionDates.flatMap((date) => {
      const dateKey = completionDateKey(date);
      return dateKey ? [dateKey] : [];
    }),
  );
  const firstDateKey = [
    ...logs.filter((log) => log.status === "complete").map((log) => log.date),
    ...completionDateKeys,
  ].sort()[0];
  const todayKey = mountainDateKey();

  if (!firstDateKey || firstDateKey > todayKey) return 0;

  let currentStreak = 0;
  let longestStreak = 0;

  for (
    let dateKey = firstDateKey;
    dateKey <= todayKey;
    dateKey = addDays(dateKey, 1)
  ) {
    const completed =
      completionDateKeys.has(dateKey) ||
      habits.some(
        (habit) => logsByHabitDate.get(`${habit.id}_${dateKey}`) === "complete",
      );

    if (completed) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return longestStreak;
}

export function getDaysUntilBirthday(birthday: string | null | undefined) {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return 0;

  const todayKey = mountainDateKey();
  const today = dateKeyToUtcDate(todayKey);
  const [, birthMonth, birthDay] = birthday.split("-").map(Number);

  let nextBirthday = new Date(
    Date.UTC(today.getUTCFullYear(), (birthMonth ?? 1) - 1, birthDay ?? 1, 12),
  );

  if (nextBirthday < today) {
    nextBirthday = new Date(
      Date.UTC(
        today.getUTCFullYear() + 1,
        (birthMonth ?? 1) - 1,
        birthDay ?? 1,
        12,
      ),
    );
  }

  return Math.max(
    0,
    Math.round(
      (nextBirthday.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
    ),
  );
}
