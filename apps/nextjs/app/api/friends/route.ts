import {
  type GoalPriority,
  friendMessages,
  friends,
  getDb,
  goalLogs,
  goals,
  users,
} from "@habit/db";
import { and, asc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { getVisibleGoalIdsForFriend } from "@/lib/goal-visibility";

const createFriendSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
});

const respondToFriendSchema = z.object({
  friendshipId: z.string().uuid(),
  action: z.literal("accept"),
});

const getDatabase = () => getDb() ?? null;
type FriendsDb = NonNullable<ReturnType<typeof getDatabase>>;

type MessageHistoryRow = {
  id: string;
  friendshipId: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

type IncentiveHistoryRow = MessageHistoryRow & {
  streakDays: number | null;
  streakPercent: number | null;
  goalScope: "all" | "shared" | "single" | "high" | null;
  goalId: string | null;
  goalName: string | null;
  accepted: boolean | null;
  progress: {
    qualifyingDays: number;
    requiredDays: number;
    percent: number;
  } | null;
};

const PRIORITY_POINTS: Record<GoalPriority, number> = {
  high: 3,
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

function getIncentiveDateKeys(createdAt: Date, dayCount: number) {
  const todayKey = mountainDateKey();
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(createdAt);
    date.setDate(date.getDate() + index);
    return mountainDateKey(date);
  }).filter((dateKey) => dateKey <= todayKey);
}

async function getIncentiveProgress(
  db: FriendsDb,
  incentive: {
    recipientId: string;
    accepted: boolean | null;
    streakDays: number | null;
    streakPercent: number | null;
    goalScope: "all" | "shared" | "single" | "high" | null;
    goalId: string | null;
    createdAt: Date;
  },
) {
  if (
    incentive.accepted !== true ||
    !incentive.streakDays ||
    !incentive.streakPercent ||
    !incentive.goalScope ||
    incentive.goalScope === "shared"
  ) {
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
    };
  }

  const applicableGoals = await db
    .select({
      id: goals.id,
      priority: goals.priority,
    })
    .from(goals)
    .where(
      and(
        eq(goals.userId, incentive.recipientId),
        eq(goals.period, "daily"),
        eq(goals.hidden, false),
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
  };
}

async function getFriendActivitySummary(
  db: FriendsDb,
  viewerId: string,
  friendId: string,
) {
  const last7DateKeys = getRecentDateKeys(7);
  const last7DateKeySet = new Set(last7DateKeys);
  const startDateKey = last7DateKeys[0] ?? mountainDateKey();

  const allDailyGoals = await db
    .select({
      id: goals.id,
      name: goals.name,
      priority: goals.priority,
      visibility: goals.visibility,
      period: goals.period,
    })
    .from(goals)
    .where(
      and(
        eq(goals.userId, friendId),
        eq(goals.period, "daily"),
        eq(goals.hidden, false),
      ),
    );
  const visibleGoalIds = await getVisibleGoalIdsForFriend(
    db,
    viewerId,
    friendId,
    allDailyGoals,
  );
  const dailyGoals = allDailyGoals.filter((goal) =>
    visibleGoalIds.has(goal.id),
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
        friendPhoneNumber: users.phoneNumber,
        lastOpenedAt: users.lastOpenedAt,
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

    const friendshipIds = rows.map((row) => row.id);
    const friendMessageRows =
      friendshipIds.length > 0
        ? await db
            .select({
              id: friendMessages.id,
              friendshipId: friendMessages.friendshipId,
              senderId: friendMessages.senderId,
              recipientId: friendMessages.recipientId,
              type: friendMessages.type,
              body: friendMessages.body,
              accepted: friendMessages.accepted,
              streakDays: friendMessages.streakDays,
              streakPercent: friendMessages.streakPercent,
              goalScope: friendMessages.goalScope,
              goalId: friendMessages.goalId,
              goalName: goals.name,
              createdAt: friendMessages.createdAt,
              readAt: friendMessages.readAt,
            })
            .from(friendMessages)
            .leftJoin(goals, eq(friendMessages.goalId, goals.id))
            .where(inArray(friendMessages.friendshipId, friendshipIds))
            .orderBy(asc(friendMessages.createdAt))
        : [];

    const messagesByFriendshipId = new Map<string, MessageHistoryRow[]>();
    const incentivesByFriendshipId = new Map<string, IncentiveHistoryRow[]>();
    const incentiveProgressById = new Map<
      string,
      IncentiveHistoryRow["progress"]
    >(
      await Promise.all(
        friendMessageRows
          .filter((message) => message.type === "incentive")
          .map(
            async (message) =>
              [message.id, await getIncentiveProgress(db, message)] as const,
          ),
      ),
    );

    for (const message of friendMessageRows) {
      const baseMessage = {
        id: message.id,
        friendshipId: message.friendshipId,
        senderId: message.senderId,
        recipientId: message.recipientId,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        readAt: message.readAt?.toISOString() ?? null,
      };

      if (message.type === "message") {
        const messages = messagesByFriendshipId.get(message.friendshipId) ?? [];

        messages.push(baseMessage);
        messagesByFriendshipId.set(message.friendshipId, messages);
        continue;
      }

      const incentives =
        incentivesByFriendshipId.get(message.friendshipId) ?? [];

      incentives.push({
        ...baseMessage,
        streakDays: message.streakDays,
        streakPercent: message.streakPercent,
        goalScope: message.goalScope,
        goalId: message.goalId,
        goalName: message.goalName,
        accepted: message.accepted,
        progress: incentiveProgressById.get(message.id) ?? null,
      });
      incentivesByFriendshipId.set(message.friendshipId, incentives);
    }

    const rowsWithActivity = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        isIncomingRequest:
          row.status === "requested" && row.userId2 === user.id,
        friendPhoneNumber:
          row.status === "accepted" ? row.friendPhoneNumber : null,
        lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
        messages: messagesByFriendshipId.get(row.id) ?? [],
        incentives: incentivesByFriendshipId.get(row.id) ?? [],
        ...(row.status === "accepted"
          ? await getFriendActivitySummary(db, user.id, row.friendId)
          : {
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
      friendPhoneNumber: null,
      isIncomingRequest: false,
      lastOpenedAt: null,
      performance7Day: null,
      goalOptions: [],
      messages: [],
      incentives: [],
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

export async function PATCH(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const parsed = respondToFriendSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    const [friendship] = await db
      .select({ id: friends.id })
      .from(friends)
      .where(
        and(
          eq(friends.id, parsed.data.friendshipId),
          eq(friends.userId2, user.id),
          eq(friends.status, "requested"),
        ),
      )
      .limit(1);

    if (!friendship) {
      return NextResponse.json(
        { error: "Friend request not found." },
        { status: 404 },
      );
    }

    await db
      .update(friends)
      .set({ status: "accepted" })
      .where(eq(friends.id, friendship.id));

    return NextResponse.json({ id: friendship.id, status: "accepted" });
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
