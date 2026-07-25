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

const createSharedGoalSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mode: z.enum(["collaborative", "competitive"]),
    scoringType: z.enum([
      "everyone_completes",
      "combined_target",
      "first_to_target",
      "highest_total",
      "longest_streak",
    ]),
    target: z.number().int().positive().nullable().default(null),
    startsOn: z.string().date().nullable().default(null),
    endsOn: z.string().date().nullable().default(null),
    personalGoalId: z.string().uuid().nullable().default(null),
    invitedUserIds: z.array(z.string().min(1)).max(25).default([]),
    stakeType: z.enum(["none", "carrot", "stick"]).default("none"),
    stakeDescription: z.string().trim().max(500).nullable().default(null),
  })
  .refine(
    ({ startsOn, endsOn }) => !startsOn || !endsOn || endsOn >= startsOn,
    { message: "End date must be on or after the start date." },
  )
  .refine(
    ({ stakeType, stakeDescription }) =>
      stakeType === "none" || Boolean(stakeDescription?.trim()),
    {
      message: "Describe the reward or consequence.",
      path: ["stakeDescription"],
    },
  );

const getDatabase = () => getDb() ?? null;

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

    return NextResponse.json(await getSharedGoalSnapshots(db, user.id));
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

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

    const parsed = createSharedGoalSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid shared goal." },
        { status: 400 },
      );
    }
    const data = parsed.data;
    if (data.personalGoalId) {
      const [personalGoal] = await db
        .select({ id: habits.id })
        .from(habits)
        .where(
          and(eq(habits.id, data.personalGoalId), eq(habits.userId, user.id)),
        )
        .limit(1);

      if (!personalGoal) {
        return NextResponse.json(
          { error: "Personal goal not found." },
          { status: 404 },
        );
      }
    }

    const uniqueInvitedUserIds = [
      ...new Set(data.invitedUserIds.filter((id) => id !== user.id)),
    ];
    const acceptedFriendRows =
      uniqueInvitedUserIds.length > 0
        ? await db
            .select({
              userId1: friends.userId1,
              userId2: friends.userId2,
            })
            .from(friends)
            .where(
              and(
                eq(friends.status, "accepted"),
                or(
                  and(
                    eq(friends.userId1, user.id),
                    inArray(friends.userId2, uniqueInvitedUserIds),
                  ),
                  and(
                    eq(friends.userId2, user.id),
                    inArray(friends.userId1, uniqueInvitedUserIds),
                  ),
                ),
              ),
            )
        : [];
    const acceptedFriendIds = new Set(
      acceptedFriendRows.map((friend) =>
        friend.userId1 === user.id ? friend.userId2 : friend.userId1,
      ),
    );

    if (
      uniqueInvitedUserIds.some((friendId) => !acceptedFriendIds.has(friendId))
    ) {
      return NextResponse.json(
        { error: "Shared goals can only invite accepted friends." },
        { status: 400 },
      );
    }

    const sharedGoalId = await db.transaction(async (tx) => {
      let personalGoalId = data.personalGoalId;

      if (!personalGoalId) {
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
        let personalGoalName = data.name;
        let suffix = 2;

        while (usedNames.has(personalGoalName)) {
          personalGoalName = `${data.name} (${suffix})`;
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
              data.mode === "collaborative"
                ? "mdi:account-group-outline"
                : "mdi:trophy-outline",
          })
          .returning({ id: habits.id });

        if (!createdPersonalGoal) {
          throw new Error("Personal goal insert failed.");
        }
        personalGoalId = createdPersonalGoal.id;
      }

      const [created] = await tx
        .insert(sharedGoals)
        .values({
          ownerId: user.id,
          name: data.name,
          mode: data.mode,
          scoringType: data.scoringType,
          target: data.target,
          startsOn: data.startsOn,
          endsOn: data.endsOn,
          stakeType: data.stakeType,
          stakeDescription:
            data.stakeType === "none" ? null : data.stakeDescription,
        })
        .returning({ id: sharedGoals.id });

      if (!created) throw new Error("Shared goal insert failed.");

      await tx.insert(sharedGoalParticipants).values([
        {
          sharedGoalId: created.id,
          userId: user.id,
          personalGoalId,
          personalGoalAutoCreated: !data.personalGoalId,
          status: "accepted",
          joinedAt: new Date(),
        },
        ...uniqueInvitedUserIds.map((friendId) => ({
          sharedGoalId: created.id,
          userId: friendId,
          status: "invited" as const,
        })),
      ]);

      return created.id;
    });
    const [snapshot] = await getSharedGoalSnapshots(db, user.id, sharedGoalId);

    for (const friendId of uniqueInvitedUserIds) {
      void sendPushToUser(friendId, "notifySharedGoalInvites", {
        title: "New shared goal",
        body: `${user.name} invited you to "${data.name}".`,
        data: { type: "shared_goal_invite", sharedGoalId },
      });
    }

    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
