import { categories, friends, getDb, goalLogs, habits, users } from "@habit/db";
import { and, asc, eq, gte, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

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

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const [me] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        lastOpenedAt: users.lastOpenedAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!me) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // A self profile shows all of the user's own daily habits — no
    // friend-visibility filtering, since it is their own data.
    const visibleHabits = await db
      .select({
        id: habits.id,
        name: habits.name,
        iconKey: habits.iconKey,
        categoryId: habits.categoryId,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        priority: habits.priority,
        defaultComplete: habits.defaultComplete,
      })
      .from(habits)
      .innerJoin(categories, eq(habits.categoryId, categories.id))
      .where(
        and(
          eq(habits.userId, user.id),
          eq(habits.period, "daily"),
          eq(habits.hidden, false),
        ),
      )
      .orderBy(asc(categories.name), asc(habits.name));

    const friendRows = await db
      .select({ id: friends.id })
      .from(friends)
      .where(
        and(
          eq(friends.status, "accepted"),
          or(eq(friends.userId1, user.id), eq(friends.userId2, user.id)),
        ),
      );

    const dateKeys = getRecentDateKeys(7);
    const startDateKey = dateKeys[0] ?? mountainDateKey();
    const visibleHabitIdList = visibleHabits.map((habit) => habit.id);

    const completedHabitRows = await db
      .select({ id: goalLogs.id })
      .from(goalLogs)
      .where(
        and(eq(goalLogs.userId, user.id), eq(goalLogs.status, "complete")),
      );

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
                eq(goalLogs.userId, user.id),
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
        id: me.id,
        name: me.name,
        email: me.email,
        image: me.image,
        lastOpenedAt: me.lastOpenedAt?.toISOString() ?? null,
      },
      stats: {
        friendCount: friendRows.length,
        habitCompletions: completedHabitRows.length,
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
