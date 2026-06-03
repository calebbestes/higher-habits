import {
  type GoalPriority,
  friends,
  getDb,
  goalLogs,
  goals,
  users,
} from "@habit/db";
import { and, asc, desc, eq, gte, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const createFriendSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
});

const getDatabase = () => getDb() ?? null;
type FriendsDb = NonNullable<ReturnType<typeof getDatabase>>;

const PRIORITY_POINTS: Record<GoalPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
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

function getRecentDateKeys(dayCount: number) {
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (dayCount - 1 - index));
    return mountainDateKey(date);
  });
}

async function getFriendActivitySummary(db: FriendsDb, friendId: string) {
  const last7DateKeys = getRecentDateKeys(7);
  const last7DateKeySet = new Set(last7DateKeys);
  const startDateKey = last7DateKeys[0] ?? mountainDateKey();

  const [lastActivity] = await db
    .select({
      date: goalLogs.date,
      updatedAt: goalLogs.updatedAt,
    })
    .from(goalLogs)
    .where(eq(goalLogs.userId, friendId))
    .orderBy(desc(goalLogs.updatedAt))
    .limit(1);

  const dailyGoals = await db
    .select({
      id: goals.id,
      name: goals.name,
      priority: goals.priority,
    })
    .from(goals)
    .where(
      and(
        eq(goals.userId, friendId),
        eq(goals.period, "daily"),
        eq(goals.hidden, false),
      ),
    );

  const dailyGoalPoints = new Map(
    dailyGoals.map((goal) => [goal.id, PRIORITY_POINTS[goal.priority]]),
  );
  const possiblePoints =
    dailyGoals.reduce(
      (total, goal) => total + PRIORITY_POINTS[goal.priority],
      0,
    ) * last7DateKeys.length;

  const completedLogs =
    dailyGoals.length > 0
      ? await db
          .select({
            goalId: goalLogs.goalId,
            date: goalLogs.date,
          })
          .from(goalLogs)
          .where(
            and(
              eq(goalLogs.userId, friendId),
              eq(goalLogs.status, "complete"),
              gte(goalLogs.date, startDateKey),
            ),
          )
      : [];

  const earnedPoints = completedLogs.reduce((total, log) => {
    if (!last7DateKeySet.has(log.date)) {
      return total;
    }

    return total + (dailyGoalPoints.get(log.goalId) ?? 0);
  }, 0);

  return {
    lastActiveAt:
      lastActivity?.updatedAt instanceof Date
        ? lastActivity.updatedAt.toISOString()
        : null,
    lastActiveDate: lastActivity?.date ?? null,
    performance7Day: {
      earnedPoints,
      possiblePoints,
      percent:
        possiblePoints > 0
          ? Math.round((earnedPoints / possiblePoints) * 100)
          : 0,
    },
    goalOptions: dailyGoals.map((goal) => ({
      id: goal.id,
      name: goal.name,
    })),
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const rows = await db
      .select({
        id: friends.id,
        userId1: friends.userId1,
        userId2: friends.userId2,
        status: friends.status,
        friendId: users.id,
        friendName: users.name,
        friendEmail: users.email,
        friendImage: users.image,
      })
      .from(friends)
      .innerJoin(
        users,
        or(
          and(eq(friends.userId1, user.id), eq(friends.userId2, users.id)),
          and(eq(friends.userId2, user.id), eq(friends.userId1, users.id)),
        ),
      )
      .where(or(eq(friends.userId1, user.id), eq(friends.userId2, user.id)))
      .orderBy(asc(users.name), asc(users.email));

    const rowsWithActivity = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        ...(row.status === "accepted"
          ? await getFriendActivitySummary(db, row.friendId)
          : {
              lastActiveAt: null,
              lastActiveDate: null,
              performance7Day: null,
              goalOptions: [],
            }),
      })),
    );

    return NextResponse.json(rowsWithActivity);
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

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const body = await request.json();
    const parsed = createFriendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    const [friendUser] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${parsed.data.email}`)
      .limit(1);

    if (!friendUser) {
      return NextResponse.json(
        { error: "No user found with that email." },
        { status: 404 },
      );
    }

    if (friendUser.id === user.id) {
      return NextResponse.json(
        { error: "You cannot add yourself as a friend." },
        { status: 400 },
      );
    }

    const [existingFriend] = await db
      .select({ id: friends.id })
      .from(friends)
      .where(
        or(
          and(eq(friends.userId1, user.id), eq(friends.userId2, friendUser.id)),
          and(eq(friends.userId1, friendUser.id), eq(friends.userId2, user.id)),
        ),
      )
      .limit(1);

    if (existingFriend) {
      return NextResponse.json(
        { error: "You are already friends with that user." },
        { status: 409 },
      );
    }

    const [row] = await db
      .insert(friends)
      .values({
        userId1: user.id,
        userId2: friendUser.id,
        status: "requested",
      })
      .returning();

    return NextResponse.json({
      ...row,
      friendId: friendUser.id,
      friendName: friendUser.name,
      friendEmail: friendUser.email,
      friendImage: friendUser.image,
      lastActiveAt: null,
      lastActiveDate: null,
      performance7Day: null,
      goalOptions: [],
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
