import { categories, friends, getDb, goalLogs, habits, users } from "@habit/db";
import { and, asc, eq, gte, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { getVisibleGoalIdsForFriend } from "@/lib/goal-visibility";

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
    const dateKeys = getRecentDateKeys(7);
    const startDateKey = dateKeys[0] ?? mountainDateKey();
    const visibleHabitIdList = visibleHabits.map((habit) => habit.id);
    const logRows =
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
                gte(goalLogs.date, startDateKey),
                inArray(goalLogs.goalId, visibleHabitIdList),
              ),
            )
        : [];
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
          defaultComplete: boolean;
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
        defaultComplete: habit.defaultComplete,
      });
      categoriesById.set(habit.categoryId, category);
    }

    return NextResponse.json({
      friend: {
        id: friend.id,
        name: friend.name,
        email: friend.email,
        image: friend.image,
        lastOpenedAt: friend.lastOpenedAt?.toISOString() ?? null,
      },
      dateKeys,
      categories: [...categoriesById.values()],
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
