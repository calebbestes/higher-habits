import { friends, getDb, goalCheckpoints, goals, users } from "@habit/db";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

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
      .select({ userId1: friends.userId1, userId2: friends.userId2 })
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
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, friendId))
      .limit(1);
    if (!friend) {
      return NextResponse.json({ error: "Friend not found." }, { status: 404 });
    }

    const goalRows = await db
      .select({
        id: goals.id,
        title: goals.title,
        color: goals.color,
        timing: goals.timing,
        planOnCalendar: goals.planOnCalendar,
        sortOrder: goals.sortOrder,
        createdAt: goals.createdAt,
        updatedAt: goals.updatedAt,
      })
      .from(goals)
      .where(eq(goals.userId, friendId))
      .orderBy(asc(goals.sortOrder), asc(goals.createdAt));

    if (goalRows.length === 0) return NextResponse.json([]);

    const checkpointRows = await db
      .select({
        id: goalCheckpoints.id,
        goalId: goalCheckpoints.goalId,
        title: goalCheckpoints.title,
        targetDate: goalCheckpoints.targetDate,
        sortOrder: goalCheckpoints.sortOrder,
        startedAt: goalCheckpoints.startedAt,
        completedAt: goalCheckpoints.completedAt,
        visibility: goalCheckpoints.visibility,
        createdAt: goalCheckpoints.createdAt,
        updatedAt: goalCheckpoints.updatedAt,
      })
      .from(goalCheckpoints)
      .where(
        and(
          eq(goalCheckpoints.userId, friendId),
          eq(goalCheckpoints.visibility, "all_friends"),
          inArray(
            goalCheckpoints.goalId,
            goalRows.map((goal) => goal.id),
          ),
        ),
      )
      .orderBy(asc(goalCheckpoints.sortOrder), asc(goalCheckpoints.createdAt));

    const checkpointsByGoal = new Map<string, typeof checkpointRows>();
    for (const checkpoint of checkpointRows) {
      const current = checkpointsByGoal.get(checkpoint.goalId) ?? [];
      current.push(checkpoint);
      checkpointsByGoal.set(checkpoint.goalId, current);
    }

    return NextResponse.json(
      goalRows.flatMap((goal) => {
        const checkpoints = checkpointsByGoal.get(goal.id) ?? [];
        if (checkpoints.length === 0) return [];
        return [
          {
            id: goal.id,
            title: goal.title,
            color: goal.color ?? null,
            timing: goal.timing === "later" ? "later" : "current",
            planOnCalendar: goal.planOnCalendar,
            sortOrder: goal.sortOrder,
            checkpoints: checkpoints.map((checkpoint) => ({
              id: checkpoint.id,
              title: checkpoint.title,
              targetDate: checkpoint.targetDate,
              sortOrder: checkpoint.sortOrder,
              started: Boolean(checkpoint.startedAt),
              startedAt: checkpoint.startedAt?.toISOString() ?? null,
              completed: Boolean(checkpoint.completedAt),
              completedAt: checkpoint.completedAt?.toISOString() ?? null,
              visibility: checkpoint.visibility,
              createdAt: checkpoint.createdAt.toISOString(),
              updatedAt: checkpoint.updatedAt.toISOString(),
            })),
            createdAt: goal.createdAt.toISOString(),
            updatedAt: goal.updatedAt.toISOString(),
          },
        ];
      }),
    );
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
