import "server-only";

import {
  categories,
  friendMessages,
  getDb,
  goalLogPhotos,
  goalLogs,
  habits,
  sharedGoalParticipants,
  sharedGoals,
} from "@habit/db";
import { and, asc, desc, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
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
    id: habits.id,
    name: habits.name,
    iconKey: habits.iconKey,
    categoryId: habits.categoryId,
    priority: habits.priority,
    visibility: habits.visibility,
    period: habits.period,
    frequencyGoal: habits.frequencyGoal,
    repeatInterval: habits.repeatInterval,
    repeatDays: habits.repeatDays,
    repeatMonthlyType: habits.repeatMonthlyType,
    createdAt: habits.createdAt,
  };

  const [
    cats,
    dailyGoals,
    periodicGoals,
    hiddenGoals,
    logs,
    photos,
    acceptedGoalIncentives,
    sharedGoalLinks,
  ] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.name)),
    db
      .select()
      .from(habits)
      .where(
        and(
          eq(habits.userId, userId),
          eq(habits.period, "daily"),
          eq(habits.hidden, false),
        ),
      )
      .orderBy(asc(habits.priority), asc(habits.name)),
    db
      .select(periodicFields)
      .from(habits)
      .where(
        and(
          eq(habits.userId, userId),
          ne(habits.period, "daily"),
          eq(habits.hidden, false),
        ),
      )
      .orderBy(asc(habits.priority), asc(habits.name)),
    db
      .select(periodicFields)
      .from(habits)
      .where(and(eq(habits.userId, userId), eq(habits.hidden, true)))
      .orderBy(asc(habits.priority), asc(habits.name)),
    db
      .select({
        goalId: goalLogs.goalId,
        date: goalLogs.date,
        status: goalLogs.status,
        visibility: goalLogs.visibility,
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
    db
      .select({
        goalId: goalLogs.goalId,
        date: goalLogs.date,
        photoId: goalLogPhotos.id,
      })
      .from(goalLogPhotos)
      .innerJoin(goalLogs, eq(goalLogPhotos.goalLogId, goalLogs.id))
      .where(
        and(
          eq(goalLogPhotos.userId, userId),
          gte(goalLogs.date, startDateKey),
          lt(goalLogs.date, endDateKeyExclusive),
        ),
      ),
    db
      .select({
        id: friendMessages.id,
        goalId: friendMessages.goalId,
        body: friendMessages.body,
        streakDays: friendMessages.streakDays,
        streakPercent: friendMessages.streakPercent,
        createdAt: friendMessages.createdAt,
      })
      .from(friendMessages)
      .where(
        and(
          eq(friendMessages.recipientId, userId),
          eq(friendMessages.type, "incentive"),
          eq(friendMessages.accepted, true),
          eq(friendMessages.goalScope, "single"),
          isNotNull(friendMessages.goalId),
          isNotNull(friendMessages.streakDays),
          isNotNull(friendMessages.streakPercent),
        ),
      )
      .orderBy(desc(friendMessages.createdAt)),
    db
      .select({
        personalGoalId: sharedGoalParticipants.personalGoalId,
        sharedGoalId: sharedGoals.id,
        sharedGoalName: sharedGoals.name,
        mode: sharedGoals.mode,
      })
      .from(sharedGoalParticipants)
      .innerJoin(
        sharedGoals,
        eq(sharedGoalParticipants.sharedGoalId, sharedGoals.id),
      )
      .where(
        and(
          eq(sharedGoalParticipants.userId, userId),
          eq(sharedGoalParticipants.status, "accepted"),
          isNotNull(sharedGoalParticipants.personalGoalId),
          ne(sharedGoals.status, "archived"),
        ),
      ),
  ]);

  const sharedGoalsByPersonalGoalId = sharedGoalLinks.reduce<
    Record<
      string,
      Array<{
        id: string;
        name: string;
        mode: "collaborative" | "competitive";
      }>
    >
  >((links, link) => {
    if (!link.personalGoalId) return links;
    links[link.personalGoalId] ??= [];
    links[link.personalGoalId].push({
      id: link.sharedGoalId,
      name: link.sharedGoalName,
      mode: link.mode,
    });
    return links;
  }, {});

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
        priority: goal.priority as "high" | "low",
        hidden: goal.hidden,
        visibility: goal.visibility,
        period: goal.period,
        frequencyGoal: goal.frequencyGoal,
        sharedGoals: sharedGoalsByPersonalGoalId[goal.id] ?? [],
      })),
    }))
    .filter((cat) => cat.goals.length > 0);

  const mapPeriodicGoal = (goal: (typeof periodicGoals)[number]) => ({
    id: goal.id,
    name: goal.name,
    iconKey: goal.iconKey,
    categoryId: goal.categoryId,
    priority: goal.priority as "high" | "low",
    visibility: goal.visibility,
    period: goal.period,
    frequencyGoal: goal.frequencyGoal,
    repeatInterval: goal.repeatInterval ?? null,
    repeatDays: (goal.repeatDays as number[] | null) ?? null,
    repeatMonthlyType: goal.repeatMonthlyType ?? null,
    createdAt: goal.createdAt.toISOString(),
    sharedGoals: sharedGoalsByPersonalGoalId[goal.id] ?? [],
  });

  return {
    categories: categoriesWithGoals,
    periodicGoals: periodicGoals.map(mapPeriodicGoal),
    hiddenGoals: hiddenGoals.map(mapPeriodicGoal),
    acceptedGoalIncentives: acceptedGoalIncentives.map((incentive) => ({
      id: incentive.id,
      goalId: incentive.goalId as string,
      body: incentive.body,
      streakDays: incentive.streakDays as number,
      streakPercent: incentive.streakPercent as number,
      createdAt: incentive.createdAt.toISOString(),
    })),
    logsByGoalDate: Object.fromEntries(
      logs.map((log) => [`${log.goalId}_${log.date}`, "complete" as const]),
    ),
    notesByGoalDate: {},
    visibilityByGoalDate: Object.fromEntries(
      logs.map((log) => [`${log.goalId}_${log.date}`, log.visibility]),
    ),
    photoCountsByGoalDate: photos.reduce<Record<string, number>>(
      (counts, photo) => {
        const key = `${photo.goalId}_${photo.date}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      },
      {},
    ),
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
