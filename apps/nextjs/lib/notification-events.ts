import {
  type getDb,
  friendMessages,
  friends,
  goalCheckpoints,
  goalLogs,
  goals,
  sharedGoalParticipants,
  sharedGoals,
} from "@habit/db";
import { and, eq, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";

import { getIncentiveProgress } from "@/lib/incentive-progress";
import { sendNotificationOnce } from "@/lib/notification-delivery";

type Database = NonNullable<ReturnType<typeof getDb>>;

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365];

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getAcceptedFriendIds(db: Database, userId: string) {
  const rows = await db
    .select({ userId1: friends.userId1, userId2: friends.userId2 })
    .from(friends)
    .where(
      and(
        eq(friends.status, "accepted"),
        or(eq(friends.userId1, userId), eq(friends.userId2, userId)),
      ),
    );

  return rows.map((row) =>
    row.userId1 === userId ? row.userId2 : row.userId1,
  );
}

async function getHabitStreak(
  db: Database,
  userId: string,
  habitId: string,
  endDate: string,
) {
  const rows = await db
    .select({ date: goalLogs.date })
    .from(goalLogs)
    .where(
      and(
        eq(goalLogs.userId, userId),
        eq(goalLogs.goalId, habitId),
        eq(goalLogs.status, "complete"),
        lte(goalLogs.date, endDate),
      ),
    );
  const completedDates = new Set(rows.map((row) => row.date));
  let streak = 0;
  let dateKey = endDate;

  while (completedDates.has(dateKey)) {
    streak += 1;
    dateKey = shiftDateKey(dateKey, -1);
  }

  return streak;
}

async function notifyFriendsOfMilestone(
  db: Database,
  {
    habitId,
    dateKey,
    habitName,
    milestone,
    userId,
    userName,
  }: {
    habitId: string;
    dateKey: string;
    habitName: string;
    milestone: number;
    userId: string;
    userName: string;
  },
) {
  const friendIds = await getAcceptedFriendIds(db, userId);
  await Promise.all(
    friendIds.map((friendId) =>
      sendNotificationOnce({
        db,
        dedupeKey: `friend-milestone:${userId}:${habitId}:${dateKey}:${milestone}`,
        message: {
          title: `${userName} hit a ${milestone}-day streak`,
          body: `${habitName} is going strong.`,
          data: { type: "friend_milestone", userId, dateKey, milestone },
        },
        preferenceKey: "notifyFriendMilestone",
        userId: friendId,
      }),
    ),
  );
}

async function notifyHabitStreakEvents(
  db: Database,
  {
    dateKey,
    habitId,
    habitName,
    canNotifyFriends,
    userId,
    userName,
  }: {
    dateKey: string;
    habitId: string;
    habitName: string;
    userId: string;
    userName: string;
    canNotifyFriends: boolean;
  },
) {
  const streak = await getHabitStreak(db, userId, habitId, dateKey);
  if (!STREAK_MILESTONES.includes(streak)) return;

  await sendNotificationOnce({
    db,
    dedupeKey: `streak-milestone:${habitId}:${dateKey}:${streak}`,
    message: {
      title: `${streak}-day streak`,
      body: `You kept up ${habitName}. Keep it going!`,
      data: { type: "streak_milestone", habitId, dateKey, streak },
    },
    preferenceKey: "notifyStreakMilestone",
    userId,
  });

  if (canNotifyFriends) {
    await notifyFriendsOfMilestone(db, {
      dateKey,
      habitId,
      habitName,
      milestone: streak,
      userId,
      userName,
    });
  }
}

async function notifyLastToCompleteForHabit(
  db: Database,
  userId: string,
  habitId: string,
  dateKey: string,
) {
  const memberships = await db
    .select({ sharedGoalId: sharedGoalParticipants.sharedGoalId })
    .from(sharedGoalParticipants)
    .innerJoin(
      sharedGoals,
      eq(sharedGoalParticipants.sharedGoalId, sharedGoals.id),
    )
    .where(
      and(
        eq(sharedGoalParticipants.userId, userId),
        eq(sharedGoalParticipants.personalGoalId, habitId),
        eq(sharedGoalParticipants.status, "accepted"),
        eq(sharedGoals.status, "active"),
      ),
    );

  for (const membership of memberships) {
    const otherParticipants = await db
      .select({
        userId: sharedGoalParticipants.userId,
        habitId: sharedGoalParticipants.personalGoalId,
      })
      .from(sharedGoalParticipants)
      .where(
        and(
          eq(sharedGoalParticipants.sharedGoalId, membership.sharedGoalId),
          eq(sharedGoalParticipants.status, "accepted"),
          ne(sharedGoalParticipants.userId, userId),
          isNotNull(sharedGoalParticipants.personalGoalId),
        ),
      );

    if (otherParticipants.length === 0) continue;

    const completed = await db
      .select({ userId: goalLogs.userId, goalId: goalLogs.goalId })
      .from(goalLogs)
      .where(
        and(
          eq(goalLogs.date, dateKey),
          eq(goalLogs.status, "complete"),
          inArray(
            goalLogs.userId,
            otherParticipants.map((participant) => participant.userId),
          ),
          inArray(
            goalLogs.goalId,
            otherParticipants.flatMap((participant) =>
              participant.habitId ? [participant.habitId] : [],
            ),
          ),
        ),
      );
    const completedKeys = new Set(
      completed.map((row) => `${row.userId}:${row.goalId}`),
    );
    const everyoneElseCompleted = otherParticipants.every(
      (participant) =>
        participant.habitId &&
        completedKeys.has(`${participant.userId}:${participant.habitId}`),
    );

    if (everyoneElseCompleted) {
      await sendNotificationOnce({
        db,
        dedupeKey: `last-to-complete:${membership.sharedGoalId}:${dateKey}`,
        message: {
          title: "You’re the last one",
          body: "Everyone else completed today’s shared goal.",
          data: {
            type: "shared_goal_last_to_complete",
            sharedGoalId: membership.sharedGoalId,
            dateKey,
          },
        },
        preferenceKey: "notifyLastToComplete",
        userId,
      });
    }
  }
}

async function notifyCompletedIncentives(
  db: Database,
  recipientId: string,
  filter?: { habitId?: string; planGoalId?: string },
) {
  const incentives = await db
    .select({
      id: friendMessages.id,
      senderId: friendMessages.senderId,
      recipientId: friendMessages.recipientId,
      accepted: friendMessages.accepted,
      streakDays: friendMessages.streakDays,
      streakPercent: friendMessages.streakPercent,
      goalScope: friendMessages.goalScope,
      targetType: friendMessages.targetType,
      goalId: friendMessages.goalId,
      planGoalId: friendMessages.planGoalId,
      createdAt: friendMessages.createdAt,
      body: friendMessages.body,
    })
    .from(friendMessages)
    .where(
      and(
        eq(friendMessages.recipientId, recipientId),
        eq(friendMessages.type, "incentive"),
        eq(friendMessages.accepted, true),
        isNull(friendMessages.incentiveCompletedAt),
        filter?.habitId
          ? or(
              eq(friendMessages.targetType, "habit"),
              eq(friendMessages.goalId, filter.habitId),
            )
          : undefined,
        filter?.planGoalId
          ? or(
              eq(friendMessages.targetType, "goal"),
              eq(friendMessages.planGoalId, filter.planGoalId),
            )
          : undefined,
      ),
    );

  await Promise.all(
    incentives.map(async (incentive) => {
      const progress = await getIncentiveProgress(db, incentive);
      if (
        !progress ||
        progress.requiredDays <= 0 ||
        progress.qualifyingDays < progress.requiredDays
      ) {
        return;
      }

      const [completed] = await db
        .update(friendMessages)
        .set({ incentiveCompletedAt: new Date() })
        .where(
          and(
            eq(friendMessages.id, incentive.id),
            isNull(friendMessages.incentiveCompletedAt),
          ),
        )
        .returning({ senderId: friendMessages.senderId });

      if (!completed) return;

      await sendNotificationOnce({
        db,
        dedupeKey: `incentive-earned:${incentive.id}`,
        message: {
          title: "Incentive earned",
          body: "Your friend completed the requirement for your incentive.",
          data: { type: "incentive_earned", incentiveId: incentive.id },
        },
        preferenceKey: "notifyIncentiveEarned",
        userId: completed.senderId,
      });
    }),
  );
}

export async function notifyHabitCompletionEvents({
  db,
  dateKey,
  habitId,
  habitName,
  canNotifyFriends,
  previouslyComplete,
  userId,
  userName,
}: {
  db: Database;
  dateKey: string;
  habitId: string;
  habitName: string;
  canNotifyFriends: boolean;
  previouslyComplete: boolean;
  userId: string;
  userName: string;
}) {
  if (previouslyComplete) return;

  await Promise.all([
    notifyHabitStreakEvents(db, {
      dateKey,
      habitId,
      habitName,
      canNotifyFriends,
      userId,
      userName,
    }),
    notifyLastToCompleteForHabit(db, userId, habitId, dateKey),
    notifyCompletedIncentives(db, userId, { habitId }),
  ]);
}

async function isPlanGoalComplete(db: Database, goalId: string) {
  const checkpoints = await db
    .select({ completedAt: goalCheckpoints.completedAt })
    .from(goalCheckpoints)
    .where(eq(goalCheckpoints.goalId, goalId));
  return (
    checkpoints.length > 0 &&
    checkpoints.every((checkpoint) => checkpoint.completedAt)
  );
}

async function notifyLastToCompleteForPlanGoal(
  db: Database,
  userId: string,
  planGoalId: string,
) {
  const memberships = await db
    .select({
      sharedGoalId: sharedGoalParticipants.sharedGoalId,
      userId: sharedGoalParticipants.userId,
    })
    .from(sharedGoalParticipants)
    .innerJoin(
      sharedGoals,
      eq(sharedGoalParticipants.sharedGoalId, sharedGoals.id),
    )
    .where(
      and(
        eq(sharedGoalParticipants.userId, userId),
        eq(sharedGoalParticipants.personalPlanGoalId, planGoalId),
        eq(sharedGoalParticipants.status, "accepted"),
        eq(sharedGoals.status, "active"),
      ),
    );

  if (memberships.length === 0) return;

  for (const membership of memberships) {
    const others = await db
      .select({
        userId: sharedGoalParticipants.userId,
        goalId: sharedGoalParticipants.personalPlanGoalId,
      })
      .from(sharedGoalParticipants)
      .where(
        and(
          eq(sharedGoalParticipants.sharedGoalId, membership.sharedGoalId),
          eq(sharedGoalParticipants.status, "accepted"),
          ne(sharedGoalParticipants.userId, userId),
          isNotNull(sharedGoalParticipants.personalPlanGoalId),
        ),
      );
    if (others.length === 0) continue;

    const everyoneElseCompleted = (
      await Promise.all(
        others.map((other) =>
          other.goalId ? isPlanGoalComplete(db, other.goalId) : false,
        ),
      )
    ).every(Boolean);

    if (everyoneElseCompleted) {
      await sendNotificationOnce({
        db,
        dedupeKey: `last-to-complete:${membership.sharedGoalId}:${planGoalId}`,
        message: {
          title: "You’re the last one",
          body: "Everyone else completed the shared goal.",
          data: {
            type: "shared_goal_last_to_complete",
            sharedGoalId: membership.sharedGoalId,
          },
        },
        preferenceKey: "notifyLastToComplete",
        userId,
      });
    }
  }
}

export async function notifyPlanGoalCompletionEvents({
  db,
  goalId,
  previouslyComplete,
  userId,
  userName,
}: {
  db: Database;
  goalId: string;
  previouslyComplete: boolean;
  userId: string;
  userName: string;
}) {
  if (previouslyComplete) return;

  const [goal] = await db
    .select({ title: goals.title })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .limit(1);
  if (!goal || !(await isPlanGoalComplete(db, goalId))) return;

  const checkpointVisibility = await db
    .select({ visibility: goalCheckpoints.visibility })
    .from(goalCheckpoints)
    .where(eq(goalCheckpoints.goalId, goalId));
  if (
    checkpointVisibility.some(
      (checkpoint) => checkpoint.visibility !== "only_me",
    )
  ) {
    const friendIds = await getAcceptedFriendIds(db, userId);
    await Promise.all(
      friendIds.map((friendId) =>
        sendNotificationOnce({
          db,
          dedupeKey: `friend-goal-milestone:${goalId}`,
          message: {
            title: `${userName} finished a goal`,
            body: goal.title,
            data: { type: "friend_milestone", goalId },
          },
          preferenceKey: "notifyFriendMilestone",
          userId: friendId,
        }),
      ),
    );
  }

  await Promise.all([
    notifyLastToCompleteForPlanGoal(db, userId, goalId),
    notifyCompletedIncentives(db, userId, { planGoalId: goalId }),
  ]);
}

export async function notifyAcceptedIncentives(
  db: Database,
  recipientId: string,
) {
  await notifyCompletedIncentives(db, recipientId);
}
