import {
  type GoalPriority,
  categories,
  friendMessages,
  friends,
  getDb,
  goalCheckpoints,
  goalLogs,
  goals,
  habits,
  tasks,
  users,
} from "@habit/db";
import { and, asc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { getVisibleGoalIdsForFriend } from "@/lib/goal-visibility";
import {
  countCompletedIncentives,
  getIncentiveProgress,
} from "@/lib/incentive-progress";
import { getLongestProfileStreak } from "@/lib/profile-metrics";
import { sendPushToUser } from "@/lib/push";

const createFriendSchema = z
  .object({
    email: z.string().trim().optional(),
    identifier: z.string().trim().optional(),
  })
  .transform((value) => value.identifier || value.email || "")
  .pipe(z.string().trim().min(1, "Email or phone number is required."));

const respondToFriendSchema = z.object({
  friendshipId: z.string().uuid(),
  action: z.enum(["accept", "archive"]),
});

const getDatabase = () => getDb() ?? null;
type FriendsDb = NonNullable<ReturnType<typeof getDatabase>>;

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

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
  targetType: "habit" | "goal";
  goalId: string | null;
  goalName: string | null;
  planGoalId: string | null;
  planGoalName: string | null;
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

function normalizeDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function getRecentDateKeys(dayCount: number) {
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (dayCount - 1 - index));
    return mountainDateKey(date);
  });
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
      id: habits.id,
      name: habits.name,
      priority: habits.priority,
      visibility: habits.visibility,
      period: habits.period,
    })
    .from(habits)
    .where(
      and(
        eq(habits.userId, friendId),
        eq(habits.period, "daily"),
        eq(habits.hidden, false),
      ),
    )
    .orderBy(asc(habits.name));
  const planGoalOptions = await db
    .select({
      id: goals.id,
      name: goals.title,
    })
    .from(goals)
    .where(eq(goals.userId, friendId))
    .orderBy(asc(goals.title));
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
    goalOptions: allDailyGoals.map((goal) => ({
      id: goal.id,
      name: goal.name,
    })),
    planGoalOptions,
  };
}

async function getAcceptedFriendIds(db: FriendsDb, userId: string) {
  const rows = await db
    .select({
      userId1: friends.userId1,
      userId2: friends.userId2,
    })
    .from(friends)
    .where(
      and(
        eq(friends.status, "accepted"),
        or(eq(friends.userId1, userId), eq(friends.userId2, userId)),
      ),
    );

  return new Set(
    rows.map((row) => (row.userId1 === userId ? row.userId2 : row.userId1)),
  );
}

async function getFriendProfile(
  db: FriendsDb,
  viewerId: string,
  lookup: { friendshipId?: string; friendId?: string },
) {
  const friendshipFilter = lookup.friendshipId
    ? eq(friends.id, lookup.friendshipId)
    : lookup.friendId
      ? or(
          and(
            eq(friends.userId1, viewerId),
            eq(friends.userId2, lookup.friendId),
          ),
          and(
            eq(friends.userId1, lookup.friendId),
            eq(friends.userId2, viewerId),
          ),
        )
      : undefined;

  const [friendship] = await db
    .select({
      id: friends.id,
      userId1: friends.userId1,
      userId2: friends.userId2,
    })
    .from(friends)
    .where(
      and(
        friendshipFilter,
        eq(friends.status, "accepted"),
        or(eq(friends.userId1, viewerId), eq(friends.userId2, viewerId)),
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
    friendship.userId1 === viewerId ? friendship.userId2 : friendship.userId1;
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
    viewerId,
    friendId,
    dailyHabitRows,
  );
  const visibleHabits = dailyHabitRows.filter((habit) =>
    visibleHabitIds.has(habit.id),
  );
  const dateKeys = getRecentDateKeys(7);
  const startDateKey = dateKeys[0] ?? mountainDateKey();
  const visibleHabitIdList = visibleHabits.map((habit) => habit.id);
  const friendRows = await db
    .select({ id: friends.id })
    .from(friends)
    .where(
      and(
        eq(friends.status, "accepted"),
        or(eq(friends.userId1, friendId), eq(friends.userId2, friendId)),
      ),
    );
  const completedHabitRows = await db
    .select({ id: goalLogs.id })
    .from(goalLogs)
    .where(and(eq(goalLogs.userId, friendId), eq(goalLogs.status, "complete")));
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
  const [incentivesEarned, incentivesGiven] = await Promise.all([
    countCompletedIncentives(db, { recipientId: friendId }),
    countCompletedIncentives(db, { senderId: friendId }),
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
  const longestStreak = getLongestProfileStreak(visibleHabits, profileLogRows);
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
      incentivesEarned,
      incentivesGiven,
      longestStreak,
      taskCompletions: completedTaskRows.length,
    },
    dateKeys,
    categories: [...categoriesById.values()],
    logsByHabitDate,
  });
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

    const profileFriendshipId = new URL(request.url).searchParams.get(
      "profileFriendshipId",
    );
    const profileFriendId = new URL(request.url).searchParams.get(
      "profileFriendId",
    );

    if (profileFriendshipId) {
      return getFriendProfile(db, user.id, {
        friendshipId: profileFriendshipId,
      });
    }

    if (profileFriendId) {
      return getFriendProfile(db, user.id, { friendId: profileFriendId });
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
        friendBirthday: users.birthday,
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
    const acceptedRows = rows.filter((row) => row.status === "accepted");
    const viewerAcceptedFriendIds = await getAcceptedFriendIds(db, user.id);
    const mutualCountsByFriendId = new Map(
      await Promise.all(
        acceptedRows.map(async (row) => {
          const friendAcceptedFriendIds = await getAcceptedFriendIds(
            db,
            row.friendId,
          );
          let mutualCount = 0;
          for (const friendId of friendAcceptedFriendIds) {
            if (friendId !== user.id && viewerAcceptedFriendIds.has(friendId)) {
              mutualCount += 1;
            }
          }
          return [row.friendId, mutualCount] as const;
        }),
      ),
    );
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
              targetType: friendMessages.targetType,
              goalId: friendMessages.goalId,
              goalName: habits.name,
              planGoalId: friendMessages.planGoalId,
              planGoalName: goals.title,
              createdAt: friendMessages.createdAt,
              readAt: friendMessages.readAt,
            })
            .from(friendMessages)
            .leftJoin(habits, eq(friendMessages.goalId, habits.id))
            .leftJoin(goals, eq(friendMessages.planGoalId, goals.id))
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
        targetType: message.targetType,
        goalId: message.goalId,
        goalName: message.goalName,
        planGoalId: message.planGoalId,
        planGoalName: message.planGoalName,
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
        friendBirthday:
          row.status === "accepted"
            ? normalizeDateKey(row.friendBirthday)
            : null,
        mutualFriendCount: mutualCountsByFriendId.get(row.friendId) ?? 0,
        lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
        messages: messagesByFriendshipId.get(row.id) ?? [],
        incentives: incentivesByFriendshipId.get(row.id) ?? [],
        ...(row.status === "accepted"
          ? await getFriendActivitySummary(db, user.id, row.friendId)
          : {
              performance7Day: null,
              goalOptions: [],
              planGoalOptions: [],
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

    const identifier = parsed.data;
    const email = identifier.includes("@") ? identifier.toLowerCase() : null;
    const phone = email ? null : normalizePhone(identifier);

    if (!email && !phone) {
      return NextResponse.json(
        { error: "Enter a valid email or phone number." },
        { status: 400 },
      );
    }

    const [friendUser] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        phoneNumber: users.phoneNumber,
      })
      .from(users)
      .where(
        email
          ? sql`lower(${users.email}) = ${email}`
          : sql`right(regexp_replace(coalesce(${users.phoneNumber}, ''), '[^0-9]', '', 'g'), 10) = ${phone}`,
      )
      .limit(1);

    if (!friendUser) {
      return NextResponse.json(
        { error: "No float account found for that email or phone number." },
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

    await sendPushToUser(friendUser.id, "notifyFriendRequests", {
      title: "New friend request",
      body: `${user.name} sent you a friend request.`,
      data: { type: "friend_request" },
    });

    return NextResponse.json({
      ...row,
      friendId: friendUser.id,
      friendName: friendUser.name,
      friendEmail: friendUser.email,
      friendImage: friendUser.image,
      friendPhoneNumber: friendUser.phoneNumber,
      friendBirthday: null,
      mutualFriendCount: 0,
      isIncomingRequest: false,
      lastOpenedAt: null,
      performance7Day: null,
      goalOptions: [],
      planGoalOptions: [],
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

    if (parsed.data.action === "archive") {
      const [friendship] = await db
        .update(friends)
        .set({ status: "archived" })
        .where(
          and(
            eq(friends.id, parsed.data.friendshipId),
            or(eq(friends.userId1, user.id), eq(friends.userId2, user.id)),
          ),
        )
        .returning({ id: friends.id, status: friends.status });

      if (!friendship) {
        return NextResponse.json(
          { error: "Friendship not found." },
          { status: 404 },
        );
      }

      return NextResponse.json(friendship);
    }

    const [friendship] = await db
      .select({ id: friends.id, requesterId: friends.userId1 })
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

    await sendPushToUser(friendship.requesterId, "notifyFriendRequestAccepted", {
      title: "Friend request accepted",
      body: `${user.name} accepted your friend request.`,
      data: { type: "friend_request_accepted" },
    });

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
