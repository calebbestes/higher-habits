import {
  friends,
  getDb,
  goals,
  sharedGoalParticipants,
  sharedGoals,
} from "@habit/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { getSharedGoalSnapshots } from "@/lib/shared-goals";

const participantActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("accept"),
    personalGoalId: z.string().uuid(),
  }),
  z.object({ action: z.literal("decline") }),
  z.object({
    action: z.literal("relink"),
    personalGoalId: z.string().uuid(),
  }),
]);
const inviteSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(25),
});

const getDatabase = () => getDb() ?? null;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sharedGoalId: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();
    const { sharedGoalId } = await params;

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const parsed = inviteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose a friend." }, { status: 400 });
    }
    const [ownedGoal] = await db
      .select({ id: sharedGoals.id })
      .from(sharedGoals)
      .where(
        and(eq(sharedGoals.id, sharedGoalId), eq(sharedGoals.ownerId, user.id)),
      )
      .limit(1);
    if (!ownedGoal) {
      return NextResponse.json(
        { error: "Only the owner can invite participants." },
        { status: 403 },
      );
    }

    const userIds = [
      ...new Set(parsed.data.userIds.filter((id) => id !== user.id)),
    ];
    if (userIds.length === 0) {
      return NextResponse.json(
        { error: "Choose at least one friend." },
        { status: 400 },
      );
    }
    const acceptedFriendRows = await db
      .select({ userId1: friends.userId1, userId2: friends.userId2 })
      .from(friends)
      .where(
        and(
          eq(friends.status, "accepted"),
          or(
            and(
              eq(friends.userId1, user.id),
              inArray(friends.userId2, userIds),
            ),
            and(
              eq(friends.userId2, user.id),
              inArray(friends.userId1, userIds),
            ),
          ),
        ),
      );
    const acceptedFriendIds = new Set(
      acceptedFriendRows.map((friend) =>
        friend.userId1 === user.id ? friend.userId2 : friend.userId1,
      ),
    );
    if (userIds.some((friendId) => !acceptedFriendIds.has(friendId))) {
      return NextResponse.json(
        { error: "Shared goals can only invite accepted friends." },
        { status: 400 },
      );
    }

    await db
      .insert(sharedGoalParticipants)
      .values(
        userIds.map((friendId) => ({
          sharedGoalId,
          userId: friendId,
          status: "invited" as const,
        })),
      )
      .onConflictDoUpdate({
        target: [
          sharedGoalParticipants.sharedGoalId,
          sharedGoalParticipants.userId,
        ],
        set: {
          status: "invited",
          personalGoalId: null,
          joinedAt: null,
          leftAt: null,
          updatedAt: new Date(),
        },
      });

    const [snapshot] = await getSharedGoalSnapshots(db, user.id, sharedGoalId);
    return NextResponse.json(snapshot);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sharedGoalId: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();
    const { sharedGoalId } = await params;

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const parsed = participantActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    let personalGoalId: string | null = null;
    if (parsed.data.action === "accept" || parsed.data.action === "relink") {
      const [personalGoal] = await db
        .select({ id: goals.id })
        .from(goals)
        .where(
          and(
            eq(goals.id, parsed.data.personalGoalId),
            eq(goals.userId, user.id),
          ),
        )
        .limit(1);
      if (!personalGoal) {
        return NextResponse.json(
          { error: "Personal goal not found." },
          { status: 404 },
        );
      }
      personalGoalId = personalGoal.id;
    }

    const [updated] = await db
      .update(sharedGoalParticipants)
      .set(
        parsed.data.action === "decline"
          ? {
              status: "declined",
              personalGoalId: null,
              joinedAt: null,
              updatedAt: new Date(),
            }
          : {
              status: "accepted",
              personalGoalId,
              joinedAt: new Date(),
              leftAt: null,
              updatedAt: new Date(),
            },
      )
      .where(
        and(
          eq(sharedGoalParticipants.sharedGoalId, sharedGoalId),
          eq(sharedGoalParticipants.userId, user.id),
        ),
      )
      .returning({ id: sharedGoalParticipants.id });

    if (!updated) {
      return NextResponse.json(
        { error: "Invitation not found." },
        { status: 404 },
      );
    }

    const [snapshot] = await getSharedGoalSnapshots(db, user.id, sharedGoalId);
    return NextResponse.json(snapshot);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
