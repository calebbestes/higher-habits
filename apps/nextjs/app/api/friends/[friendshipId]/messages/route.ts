import {
  type NewFriendMessage,
  friendMessages,
  friends,
  getDb,
  goals,
  habits,
  socialFeedPosts,
} from "@habit/db";
import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { notifyAcceptedIncentives } from "@/lib/notification-events";
import { sendPushToUser } from "@/lib/push";

const sendMessageSchema = z.union([
  z.object({
    type: z.literal("message"),
    body: z.string().trim().min(1),
  }),
  z
    .object({
      type: z.literal("incentive"),
      body: z.string().trim().min(1),
      targetType: z.enum(["habit", "goal"]).default("habit"),
      streakDays: z.number().int().min(1).optional(),
      streakPercent: z.number().int().min(1).max(100).optional(),
      goalScope: z.enum(["all", "shared", "single", "high"]),
      goalId: z.string().uuid().optional(),
      planGoalId: z.string().uuid().optional(),
    })
    .superRefine((value, context) => {
      if (value.targetType === "habit") {
        if (value.streakDays === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["streakDays"],
            message: "Streak length is required for habit incentives.",
          });
        }
        if (value.streakPercent === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["streakPercent"],
            message: "Completion threshold is required for habit incentives.",
          });
        }
        if (value.goalScope === "single" && !value.goalId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["goalId"],
            message: "Choose a habit for a single-habit incentive.",
          });
        }
        return;
      }

      if (value.goalScope !== "all" && value.goalScope !== "single") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["goalScope"],
          message: "Personal-goal incentives can target all goals or one goal.",
        });
      }
      if (value.goalScope === "single" && !value.planGoalId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["planGoalId"],
          message: "Choose a personal goal for a single-goal incentive.",
        });
      }
    }),
]);

const acceptIncentiveSchema = z.object({
  messageId: z.string().uuid(),
});

export async function POST(
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
      .select()
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

    const recipientId =
      friendship.userId1 === user.id ? friendship.userId2 : friendship.userId1;

    const body = await request.json();
    const parsed = sendMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    if (parsed.data.type === "incentive") {
      const targetId =
        parsed.data.targetType === "goal"
          ? parsed.data.planGoalId
          : parsed.data.goalId;

      if (parsed.data.goalScope === "single" && targetId) {
        const [target] = await db
          .select({
            id: parsed.data.targetType === "goal" ? goals.id : habits.id,
          })
          .from(parsed.data.targetType === "goal" ? goals : habits)
          .where(
            and(
              eq(
                parsed.data.targetType === "goal" ? goals.id : habits.id,
                targetId,
              ),
              eq(
                parsed.data.targetType === "goal"
                  ? goals.userId
                  : habits.userId,
                recipientId,
              ),
            ),
          )
          .limit(1);

        if (!target) {
          return NextResponse.json(
            { error: "That goal is not available for this friend." },
            { status: 400 },
          );
        }
      }
    }

    const values: NewFriendMessage =
      parsed.data.type === "message"
        ? {
            friendshipId,
            senderId: user.id,
            recipientId,
            type: "message",
            body: parsed.data.body,
          }
        : {
            friendshipId,
            senderId: user.id,
            recipientId,
            type: "incentive",
            body: parsed.data.body,
            streakDays:
              parsed.data.targetType === "habit"
                ? (parsed.data.streakDays ?? null)
                : null,
            streakPercent:
              parsed.data.targetType === "habit"
                ? (parsed.data.streakPercent ?? null)
                : null,
            goalScope: parsed.data.goalScope,
            targetType: parsed.data.targetType,
            goalId:
              parsed.data.targetType === "habit"
                ? (parsed.data.goalId ?? null)
                : null,
            planGoalId:
              parsed.data.targetType === "goal"
                ? (parsed.data.planGoalId ?? null)
                : null,
          };

    const [row] = await db.insert(friendMessages).values(values).returning();

    if (parsed.data.type === "message") {
      await sendPushToUser(recipientId, "notifyFriendNudges", {
        title: `${user.name} nudged you`,
        body: parsed.data.body,
        data: { type: "friend_nudge", friendshipId },
      });
    } else if (parsed.data.type === "incentive") {
      if (row) {
        await db
          .insert(socialFeedPosts)
          .values({
            userId: user.id,
            targetUserId: recipientId,
            kind: "incentive",
            sourceType: "friend_message",
            sourceId: row.id,
            title: "Sent an incentive",
            body: parsed.data.body,
          })
          .onConflictDoNothing();
      }

      await sendPushToUser(recipientId, "notifySharedGoalInvites", {
        title: "New incentive",
        body: `${user.name} sent you an incentive challenge.`,
        data: { type: "incentive", friendshipId },
      });
    }

    return NextResponse.json(row, { status: 201 });
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

export async function PATCH(
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

    const body = await request.json();
    const parsed = acceptIncentiveSchema.safeParse(body);

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

    const [row] = await db
      .update(friendMessages)
      .set({ accepted: true })
      .where(
        and(
          eq(friendMessages.id, parsed.data.messageId),
          eq(friendMessages.friendshipId, friendshipId),
          eq(friendMessages.recipientId, user.id),
          eq(friendMessages.type, "incentive"),
        ),
      )
      .returning({
        id: friendMessages.id,
        accepted: friendMessages.accepted,
        senderId: friendMessages.senderId,
      });

    if (!row) {
      return NextResponse.json(
        { error: "Incentive not found." },
        { status: 404 },
      );
    }

    // An accepted incentive is not earned yet. Recalculate in case the
    // requirement was already satisfied, otherwise completion events will
    // claim and notify it later.
    await notifyAcceptedIncentives(db, user.id).catch((error) => {
      console.error("Accepted incentive notification failed", error);
    });

    return NextResponse.json({ id: row.id, accepted: row.accepted });
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
