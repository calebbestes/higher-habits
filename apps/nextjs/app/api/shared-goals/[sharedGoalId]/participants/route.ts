import {
  categories,
  friends,
  getDb,
  habits,
  sharedGoalParticipants,
  sharedGoals,
} from "@habit/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";
import { getSharedGoalSnapshots } from "@/lib/shared-goals";

const participantActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("accept"),
    personalGoalId: z.string().uuid().nullable().default(null),
  }),
  z.object({ action: z.literal("decline") }),
  z.object({
    action: z.literal("relink"),
    personalGoalId: z.string().uuid().nullable().default(null),
    deletePreviousAutoCreated: z.boolean().default(false),
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
      .select({ id: sharedGoals.id, name: sharedGoals.name })
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
          personalGoalAutoCreated: false,
          joinedAt: null,
          leftAt: null,
          updatedAt: new Date(),
        },
      });

    for (const friendId of userIds) {
      void sendPushToUser(friendId, "notifySharedGoalInvites", {
        title: "New shared goal",
        body: `${user.name} invited you to "${ownedGoal.name}".`,
        data: { type: "shared_goal_invite", sharedGoalId },
      });
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

    if (
      (parsed.data.action === "accept" || parsed.data.action === "relink") &&
      parsed.data.personalGoalId
    ) {
      const [personalGoal] = await db
        .select({ id: habits.id })
        .from(habits)
        .where(
          and(
            eq(habits.id, parsed.data.personalGoalId),
            eq(habits.userId, user.id),
          ),
        )
        .limit(1);
      if (!personalGoal) {
        return NextResponse.json(
          { error: "Personal goal not found." },
          { status: 404 },
        );
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [existingParticipant] = await tx
        .select({
          id: sharedGoalParticipants.id,
          personalGoalId: sharedGoalParticipants.personalGoalId,
          personalGoalAutoCreated:
            sharedGoalParticipants.personalGoalAutoCreated,
        })
        .from(sharedGoalParticipants)
        .where(
          and(
            eq(sharedGoalParticipants.sharedGoalId, sharedGoalId),
            eq(sharedGoalParticipants.userId, user.id),
          ),
        )
        .limit(1);

      if (!existingParticipant) return null;

      let personalGoalId =
        parsed.data.action === "decline" ? null : parsed.data.personalGoalId;
      let personalGoalAutoCreated = false;

      if (parsed.data.action !== "decline" && !personalGoalId) {
        const [sharedGoal] = await tx
          .select({
            name: sharedGoals.name,
            mode: sharedGoals.mode,
          })
          .from(sharedGoals)
          .where(eq(sharedGoals.id, sharedGoalId))
          .limit(1);

        if (!sharedGoal) return null;

        const [existingCategory] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.userId, user.id),
              eq(categories.name, "Shared Goals"),
            ),
          )
          .limit(1);
        const categoryId =
          existingCategory?.id ??
          (
            await tx
              .insert(categories)
              .values({
                userId: user.id,
                name: "Shared Goals",
                icon: "mdi:account-group-outline",
              })
              .returning({ id: categories.id })
          )[0]?.id;

        if (!categoryId) throw new Error("Shared goal category insert failed.");

        const existingNames = await tx
          .select({ name: habits.name })
          .from(habits)
          .where(
            and(eq(habits.userId, user.id), eq(habits.categoryId, categoryId)),
          );
        const usedNames = new Set(existingNames.map((goal) => goal.name));
        let personalGoalName = sharedGoal.name;
        let suffix = 2;

        while (usedNames.has(personalGoalName)) {
          personalGoalName = `${sharedGoal.name} (${suffix})`;
          suffix += 1;
        }

        const [createdPersonalGoal] = await tx
          .insert(habits)
          .values({
            userId: user.id,
            name: personalGoalName,
            period: "daily",
            categoryId,
            priority: "low",
            visibility: "goal_friends",
            iconKey:
              sharedGoal.mode === "collaborative"
                ? "mdi:account-group-outline"
                : "mdi:trophy-outline",
          })
          .returning({ id: habits.id });

        if (!createdPersonalGoal) {
          throw new Error("Personal goal insert failed.");
        }
        personalGoalId = createdPersonalGoal.id;
        personalGoalAutoCreated = true;
      }

      const [participant] = await tx
        .update(sharedGoalParticipants)
        .set(
          parsed.data.action === "decline"
            ? {
                status: "declined",
                personalGoalId: null,
                personalGoalAutoCreated: false,
                joinedAt: null,
                updatedAt: new Date(),
              }
            : {
                status: "accepted",
                personalGoalId,
                personalGoalAutoCreated,
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

      if (
        participant &&
        parsed.data.action === "relink" &&
        parsed.data.deletePreviousAutoCreated &&
        existingParticipant.personalGoalAutoCreated &&
        existingParticipant.personalGoalId &&
        existingParticipant.personalGoalId !== personalGoalId
      ) {
        await tx
          .delete(habits)
          .where(
            and(
              eq(habits.id, existingParticipant.personalGoalId),
              eq(habits.userId, user.id),
            ),
          );
      }

      return participant ?? null;
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Invitation not found." },
        { status: 404 },
      );
    }

    const [snapshot] = await getSharedGoalSnapshots(db, user.id, sharedGoalId);

    if (
      snapshot &&
      snapshot.ownerId !== user.id &&
      (parsed.data.action === "accept" || parsed.data.action === "decline")
    ) {
      const joined = parsed.data.action === "accept";
      void sendPushToUser(snapshot.ownerId, "notifySharedGoalResponses", {
        title: joined ? "Shared goal joined" : "Invite declined",
        body: `${user.name} ${joined ? "joined" : "declined"} "${snapshot.name}".`,
        data: { type: "shared_goal_response", sharedGoalId },
      });
    }

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
