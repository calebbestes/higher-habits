type ProfileHabit = {
  id: string;
  createdAt: Date;
  defaultComplete: boolean;
};

type ProfileHabitLog = {
  goalId: string;
  date: string;
  status: "complete" | "incomplete" | "planned";
};

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

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createdDateKey(date: Date) {
  return mountainDateKey(date);
}

export function getLongestProfileStreak(
  habits: ProfileHabit[],
  logs: ProfileHabitLog[],
) {
  if (habits.length === 0) return 0;

  const logsByHabitDate = new Map(
    logs.map((log) => [`${log.goalId}_${log.date}`, log.status]),
  );
  const firstDateKey = [
    ...logs.map((log) => log.date),
    ...habits
      .filter((habit) => habit.defaultComplete)
      .map((habit) => createdDateKey(habit.createdAt)),
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
    const completed = habits.some((habit) => {
      const status = logsByHabitDate.get(`${habit.id}_${dateKey}`);
      return (
        status === "complete" ||
        (status === undefined &&
          habit.defaultComplete &&
          dateKey >= createdDateKey(habit.createdAt))
      );
    });

    if (completed) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return longestStreak;
}
