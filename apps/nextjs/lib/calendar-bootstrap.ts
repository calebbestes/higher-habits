import "server-only";

import { categories, getDb, goalLogs, goals } from "@habit/db";
import { and, asc, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import { z } from "zod";

import type { CalendarBootstrapData } from "./calendar-bootstrap-types";
import type { GoalLogsSnapshot } from "./goal-logs-client";

const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;
const monthSchema = z.string().regex(MONTH_KEY_REGEX, "Month must be YYYY-MM");

const getDatabase = () => getDb() ?? null;

function getMonthDateRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { startDateKey: fmt(start), endDateKeyExclusive: fmt(end) };
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(month: string): Date {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year, mon - 1, 1);
}

const getGoalLogsSnapshotForMonth = async (
  db: NonNullable<ReturnType<typeof getDatabase>>,
  month: string,
  userId: string,
): Promise<GoalLogsSnapshot> => {
  const { startDateKey, endDateKeyExclusive } = getMonthDateRange(month);

  const periodicFields = {
    id: goals.id,
    name: goals.name,
    iconKey: goals.iconKey,
    categoryId: goals.categoryId,
    priority: goals.priority,
    period: goals.period,
    frequencyGoal: goals.frequencyGoal,
  };

  const [cats, dailyGoals, periodicGoals, hiddenGoals, logs] =
    await Promise.all([
      db
        .select()
        .from(categories)
        .where(eq(categories.userId, userId))
        .orderBy(asc(categories.name)),
      db
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.userId, userId),
            eq(goals.period, "daily"),
            eq(goals.hidden, false),
          ),
        )
        .orderBy(asc(goals.priority), asc(goals.name)),
      db
        .select(periodicFields)
        .from(goals)
        .where(
          and(
            eq(goals.userId, userId),
            or(ne(goals.period, "daily"), isNull(goals.period)),
            eq(goals.hidden, false),
          ),
        )
        .orderBy(asc(goals.priority), asc(goals.name)),
      db
        .select(periodicFields)
        .from(goals)
        .where(and(eq(goals.userId, userId), eq(goals.hidden, true)))
        .orderBy(asc(goals.priority), asc(goals.name)),
      db
        .select({
          goalId: goalLogs.goalId,
          date: goalLogs.date,
          status: goalLogs.status,
        })
        .from(goalLogs)
        .where(
          and(
            eq(goalLogs.userId, userId),
            gte(goalLogs.date, startDateKey),
            lt(goalLogs.date, endDateKeyExclusive),
            eq(goalLogs.status, "complete"),
          ),
        ),
    ]);

  const goalsByCategoryId = dailyGoals.reduce<
    Record<string, typeof dailyGoals>
  >((acc, goal) => {
    if (!acc[goal.categoryId]) acc[goal.categoryId] = [];
    acc[goal.categoryId].push(goal);
    return acc;
  }, {});

  const categoriesWithGoals = cats
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      goals: (goalsByCategoryId[cat.id] ?? []).map((goal) => ({
        id: goal.id,
        name: goal.name,
        iconKey: goal.iconKey,
        categoryId: goal.categoryId,
        priority: goal.priority as "high" | "medium" | "low",
        hidden: goal.hidden,
      })),
    }))
    .filter((cat) => cat.goals.length > 0);

  const mapPeriodicGoal = (goal: (typeof periodicGoals)[number]) => ({
    id: goal.id,
    name: goal.name,
    iconKey: goal.iconKey,
    categoryId: goal.categoryId,
    priority: goal.priority as "high" | "medium" | "low",
    period: goal.period,
    frequencyGoal: goal.frequencyGoal,
  });

  return {
    categories: categoriesWithGoals,
    periodicGoals: periodicGoals.map(mapPeriodicGoal),
    hiddenGoals: hiddenGoals.map(mapPeriodicGoal),
    logsByGoalDate: Object.fromEntries(
      logs.map((log) => [`${log.goalId}_${log.date}`, "complete" as const]),
    ),
    notesByGoalDate: {},
  };
};

const getGoalLogsByDateForMonth = async (
  db: NonNullable<ReturnType<typeof getDatabase>>,
  month: string,
  userId: string,
) => {
  const { startDateKey, endDateKeyExclusive } = getMonthDateRange(month);

  const logs = await db
    .select({
      goalId: goalLogs.goalId,
      date: goalLogs.date,
      status: goalLogs.status,
    })
    .from(goalLogs)
    .where(
      and(
        eq(goalLogs.userId, userId),
        gte(goalLogs.date, startDateKey),
        lt(goalLogs.date, endDateKeyExclusive),
        eq(goalLogs.status, "complete"),
      ),
    );

  return Object.fromEntries(
    logs.map((log) => [`${log.goalId}_${log.date}`, "complete" as const]),
  );
};

export const getCalendarBootstrap = async (
  monthInput: string,
  userId: string,
): Promise<CalendarBootstrapData> => {
  const month = monthSchema.parse(monthInput);
  const db = getDatabase();

  if (!db) throw new Error("Database is not configured.");

  const monthDate = parseMonthKey(month);
  const prevMonth = getMonthKey(
    new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1),
  );

  const [currentGoalLogsSnapshot, prevGoalLogsByDate] = await Promise.all([
    getGoalLogsSnapshotForMonth(db, month, userId),
    getGoalLogsByDateForMonth(db, prevMonth, userId),
  ]);

  return {
    month,
    prevMonth,
    hiddenKeys: [],
    currentCustomDayIconsByDate: {},
    currentGoalLogsSnapshot,
    prevGoalLogsByDate,
  };
};
