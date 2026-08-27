import {
  friendMessages,
  type getDb,
  goalCheckpoints,
  goalLogs,
  goals,
  habits,
} from "@habit/db";
import { and, eq, gte, inArray } from "drizzle-orm";

type IncentiveDb = NonNullable<ReturnType<typeof getDb>>;

type Incentive = {
  recipientId: string;
  accepted: boolean | null;
  streakDays: number | null;
  streakPercent: number | null;
  goalScope: "all" | "shared" | "single" | "high" | null;
  targetType: "habit" | "goal";
  goalId: string | null;
  planGoalId: string | null;
  createdAt: Date;
};

type IncentiveProgress = {
  qualifyingDays: number;
  requiredDays: number;
  percent: number;
  unit: "days" | "checkpoints";
};

const PRIORITY_POINTS = {
  high: 3,
  low: 1,
} as const;

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

function getIncentiveDateKeys(createdAt: Date, dayCount: number) {
  const todayKey = mountainDateKey();
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(createdAt);
    date.setDate(date.getDate() + index);
    return mountainDateKey(date);
  }).filter((dateKey) => dateKey <= todayKey);
}

export async function getIncentiveProgress(
  db: IncentiveDb,
  incentive: Incentive,
): Promise<IncentiveProgress | null> {
  if (
    incentive.accepted !== true ||
    !incentive.goalScope ||
    incentive.goalScope === "shared"
  ) {
    return null;
  }

  if (incentive.targetType === "goal") {
    if (
      (incentive.goalScope !== "all" && incentive.goalScope !== "single") ||
      (incentive.goalScope === "single" && !incentive.planGoalId)
    ) {
      return null;
    }

    const availableGoals = await db
      .select({ id: goals.id })
      .from(goals)
      .where(eq(goals.userId, incentive.recipientId));
    const scopedGoalIds = availableGoals
      .filter(
        (goal) =>
          incentive.goalScope === "all" || goal.id === incentive.planGoalId,
      )
      .map((goal) => goal.id);

    if (scopedGoalIds.length === 0) {
      return {
        qualifyingDays: 0,
        requiredDays: 0,
        percent: 0,
        unit: "checkpoints",
      };
    }

    const checkpoints = await db
      .select({
        goalId: goalCheckpoints.goalId,
        completedAt: goalCheckpoints.completedAt,
      })
      .from(goalCheckpoints)
      .where(
        and(
          eq(goalCheckpoints.userId, incentive.recipientId),
          inArray(goalCheckpoints.goalId, scopedGoalIds),
        ),
      );
    const completedCount = checkpoints.filter((checkpoint) =>
      Boolean(checkpoint.completedAt),
    ).length;

    return {
      qualifyingDays: completedCount,
      requiredDays: checkpoints.length,
      percent:
        checkpoints.length > 0
          ? Math.min(
              100,
              Math.round((completedCount / checkpoints.length) * 100),
            )
          : 0,
      unit: "checkpoints",
    };
  }

  if (!incentive.streakDays || !incentive.streakPercent) {
    return null;
  }

  const requiredDays = incentive.streakDays;
  const requiredPercent = incentive.streakPercent;
  const dateKeys = getIncentiveDateKeys(incentive.createdAt, requiredDays);
  const startDateKey = dateKeys[0];

  if (!startDateKey) {
    return {
      qualifyingDays: 0,
      requiredDays,
      percent: 0,
      unit: "days",
    };
  }

  const applicableGoals = await db
    .select({
      id: habits.id,
      priority: habits.priority,
    })
    .from(habits)
    .where(
      and(
        eq(habits.userId, incentive.recipientId),
        eq(habits.period, "daily"),
        eq(habits.hidden, false),
      ),
    );

  const scopedGoals = applicableGoals.filter((goal) => {
    if (incentive.goalScope === "single") {
      return goal.id === incentive.goalId;
    }
    if (incentive.goalScope === "high") {
      return goal.priority === "high";
    }
    return incentive.goalScope === "all";
  });
  const goalPoints = new Map(
    scopedGoals.map((goal) => [goal.id, PRIORITY_POINTS[goal.priority]]),
  );
  const possiblePoints = scopedGoals.reduce(
    (total, goal) => total + PRIORITY_POINTS[goal.priority],
    0,
  );
  const completedLogs =
    scopedGoals.length > 0
      ? await db
          .select({
            goalId: goalLogs.goalId,
            date: goalLogs.date,
          })
          .from(goalLogs)
          .where(
            and(
              eq(goalLogs.userId, incentive.recipientId),
              eq(goalLogs.status, "complete"),
              gte(goalLogs.date, startDateKey),
            ),
          )
      : [];
  const earnedPointsByDate = new Map<string, number>();

  for (const log of completedLogs) {
    const points = goalPoints.get(log.goalId);
    if (!points || !dateKeys.includes(log.date)) continue;
    earnedPointsByDate.set(
      log.date,
      (earnedPointsByDate.get(log.date) ?? 0) + points,
    );
  }

  const qualifyingDays =
    possiblePoints > 0
      ? dateKeys.filter((dateKey) => {
          const earnedPoints = earnedPointsByDate.get(dateKey) ?? 0;
          return (
            Math.round((earnedPoints / possiblePoints) * 100) >= requiredPercent
          );
        }).length
      : 0;

  return {
    qualifyingDays,
    requiredDays,
    percent: Math.min(100, Math.round((qualifyingDays / requiredDays) * 100)),
    unit: "days",
  };
}

export async function countCompletedIncentives(
  db: IncentiveDb,
  filter: { recipientId: string } | { senderId: string },
) {
  const where =
    "recipientId" in filter
      ? and(
          eq(friendMessages.recipientId, filter.recipientId),
          eq(friendMessages.type, "incentive"),
        )
      : and(
          eq(friendMessages.senderId, filter.senderId),
          eq(friendMessages.type, "incentive"),
        );
  const incentives = await db
    .select({
      recipientId: friendMessages.recipientId,
      accepted: friendMessages.accepted,
      streakDays: friendMessages.streakDays,
      streakPercent: friendMessages.streakPercent,
      goalScope: friendMessages.goalScope,
      targetType: friendMessages.targetType,
      goalId: friendMessages.goalId,
      planGoalId: friendMessages.planGoalId,
      createdAt: friendMessages.createdAt,
    })
    .from(friendMessages)
    .where(where);

  const completed = await Promise.all(
    incentives.map(async (incentive) => {
      const progress = await getIncentiveProgress(db, incentive);
      return (
        progress !== null &&
        progress.requiredDays > 0 &&
        progress.qualifyingDays >= progress.requiredDays
      );
    }),
  );

  return completed.filter(Boolean).length;
}
