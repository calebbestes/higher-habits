import {
  categories,
  friendMessages,
  friends,
  getDb,
  goalCheckpoints,
  goalLogs,
  habits,
  tasks,
  users,
} from "@habit/db";
import { and, asc, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { getVisibleGoalIdsForFriend } from "@/lib/goal-visibility";
import { getLongestProfileStreak } from "@/lib/profile-metrics";

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

function getRecentDateKeys(dayCount: number) {
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (dayCount - 1 - index));
    return mountainDateKey(date);
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ friendshipId: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { friendshipId } = await params;
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const [friendship] = await db
      .select({
        id: friends.id,
        userId1: friends.userId1,
        userId2: friends.userId2,
      })
      .from(friends)
      .where(
        and(
          eq(friends.id, friendshipId),
          eq(friends.status, "accepted"),
          or(eq(friends.userId1, user.id), eq(friends.userId2, user.id)),
        ),
      )
      .limit(1);

    if (!friendship) {
      return NextResponse.json(
        { error: "Friendship not found." },
        { status: 404 },
      );
    }

    const friendId =
      friendship.userId1 === user.id ? friendship.userId2 : friendship.userId1;
    const [friend] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        lastOpenedAt: users.lastOpenedAt,
      })
      .from(users)
      .where(eq(users.id, friendId))
      .limit(1);

    if (!friend) {
      return NextResponse.json({ error: "Friend not found." }, { status: 404 });
    }

    const dailyHabitRows = await db
      .select({
        id: habits.id,
        name: habits.name,
        iconKey: habits.iconKey,
        categoryId: habits.categoryId,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        priority: habits.priority,
        visibility: habits.visibility,
        period: habits.period,
        defaultComplete: habits.defaultComplete,
        requireEvidence: habits.requireEvidence,
        createdAt: habits.createdAt,
      })
      .from(habits)
      .innerJoin(categories, eq(habits.categoryId, categories.id))
      .where(
        and(
          eq(habits.userId, friendId),
          eq(habits.period, "daily"),
          eq(habits.hidden, false),
        ),
      )
      .orderBy(asc(categories.name), asc(habits.name));

    const visibleHabitIds = await getVisibleGoalIdsForFriend(
      db,
      user.id,
      friendId,
      dailyHabitRows,
    );
    const visibleHabits = dailyHabitRows.filter((habit) =>
      visibleHabitIds.has(habit.id),
    );
    const periodicHabitRows = await db
      .select({
        id: habits.id,
        name: habits.name,
        iconKey: habits.iconKey,
        categoryId: habits.categoryId,
        priority: habits.priority,
        visibility: habits.visibility,
        period: habits.period,
        frequencyGoal: habits.frequencyGoal,
        defaultComplete: habits.defaultComplete,
        requireEvidence: habits.requireEvidence,
        createdAt: habits.createdAt,
      })
      .from(habits)
      .where(
        and(
          eq(habits.userId, friendId),
          ne(habits.period, "daily"),
          eq(habits.hidden, false),
        ),
      )
      .orderBy(asc(habits.priority), asc(habits.name));
    const visiblePeriodicHabitIds = await getVisibleGoalIdsForFriend(
      db,
      user.id,
      friendId,
      periodicHabitRows,
    );
    const visiblePeriodicHabits = periodicHabitRows.filter((habit) =>
      visiblePeriodicHabitIds.has(habit.id),
    );
    const friendRows = await db
      .select({ id: friends.id })
      .from(friends)
      .where(
        and(
          eq(friends.status, "accepted"),
          or(eq(friends.userId1, friendId), eq(friends.userId2, friendId)),
        ),
      );
    const dateKeys = getRecentDateKeys(7);
    const startDateKey = dateKeys[0] ?? mountainDateKey();
    const visibleHabitIdList = [
      ...visibleHabits.map((habit) => habit.id),
      ...visiblePeriodicHabits.map((habit) => habit.id),
    ];
    const completedHabitRows =
      visibleHabitIdList.length > 0
        ? await db
            .select({ id: goalLogs.id })
            .from(goalLogs)
            .where(
              and(
                eq(goalLogs.userId, friendId),
                eq(goalLogs.status, "complete"),
                inArray(goalLogs.goalId, visibleHabitIdList),
              ),
            )
        : [];
    const completedCheckpointRows = await db
      .select({ id: goalCheckpoints.id })
      .from(goalCheckpoints)
      .where(
        and(
          eq(goalCheckpoints.userId, friendId),
          isNotNull(goalCheckpoints.completedAt),
          eq(goalCheckpoints.visibility, "all_friends"),
        ),
      );
    const completedTaskRows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.userId, friendId), isNotNull(tasks.completedAt)));
    const [earnedIncentiveRows, givenIncentiveRows] = await Promise.all([
      db
        .select({ id: friendMessages.id })
        .from(friendMessages)
        .where(
          and(
            eq(friendMessages.recipientId, friendId),
            eq(friendMessages.type, "incentive"),
            eq(friendMessages.accepted, true),
          ),
        ),
      db
        .select({ id: friendMessages.id })
        .from(friendMessages)
        .where(
          and(
            eq(friendMessages.senderId, friendId),
            eq(friendMessages.type, "incentive"),
          ),
        ),
    ]);
    const profileLogRows =
      visibleHabitIdList.length > 0
        ? await db
            .select({
              goalId: goalLogs.goalId,
              date: goalLogs.date,
              status: goalLogs.status,
            })
            .from(goalLogs)
            .where(
              and(
                eq(goalLogs.userId, friendId),
                inArray(goalLogs.goalId, visibleHabitIdList),
              ),
            )
        : [];
    const logRows = profileLogRows.filter((log) => log.date >= startDateKey);
    const longestStreak = getLongestProfileStreak(
      [...visibleHabits, ...visiblePeriodicHabits],
      profileLogRows,
    );
    const logsByHabitDate = Object.fromEntries(
      logRows
        .filter(
          (log) =>
            log.status === "complete" ||
            log.status === "planned" ||
            log.status === "incomplete",
        )
        .map((log) => [`${log.goalId}_${log.date}`, log.status]),
    );
    const categoriesById = new Map<
      string,
      {
        id: string;
        name: string;
        icon: string;
        habits: Array<{
          id: string;
          name: string;
          iconKey: string;
          priority: "high" | "low";
          visibility: "only_me" | "goal_friends" | "all_friends";
          defaultComplete: boolean;
          requireEvidence: boolean;
        }>;
      }
    >();

    for (const habit of visibleHabits) {
      const category = categoriesById.get(habit.categoryId) ?? {
        id: habit.categoryId,
        name: habit.categoryName,
        icon: habit.categoryIcon,
        habits: [],
      };

      category.habits.push({
        id: habit.id,
        name: habit.name,
        iconKey: habit.iconKey,
        priority: habit.priority,
        visibility: habit.visibility,
        defaultComplete: habit.defaultComplete,
        requireEvidence: habit.requireEvidence,
      });
      categoriesById.set(habit.categoryId, category);
    }

    return NextResponse.json({
      friend: {
        id: friend.id,
        friendshipId: friendship.id,
        name: friend.name,
        email: friend.email,
        image: friend.image,
        lastOpenedAt: friend.lastOpenedAt?.toISOString() ?? null,
      },
      stats: {
        friendCount: friendRows.length,
        goalCompletions: completedCheckpointRows.length,
        habitCompletions: completedHabitRows.length,
        incentivesEarned: earnedIncentiveRows.length,
        incentivesGiven: givenIncentiveRows.length,
        longestStreak,
        taskCompletions: completedTaskRows.length,
      },
      dateKeys,
      categories: [...categoriesById.values()],
      periodicHabits: visiblePeriodicHabits.map((habit) => ({
        id: habit.id,
        name: habit.name,
        iconKey: habit.iconKey,
        categoryId: habit.categoryId,
        priority: habit.priority,
        visibility: habit.visibility,
        period: habit.period,
        frequencyGoal: habit.frequencyGoal,
        defaultComplete: habit.defaultComplete,
        requireEvidence: habit.requireEvidence,
      })),
      logsByHabitDate,
    });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
