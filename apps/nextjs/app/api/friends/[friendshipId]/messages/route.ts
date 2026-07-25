import { friendMessages, friends, getDb } from "@habit/db";
import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  awardCreditAction,
  getLocalDateKeyFromRequest,
  jsonWithCreditHeaders,
} from "@/lib/float-credits";
import { sendPushToUser } from "@/lib/push";

const sendMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    body: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("incentive"),
    body: z.string().trim().min(1),
    streakDays: z.number().int().min(1),
    streakPercent: z.number().int().min(1).max(100),
    goalScope: z.enum(["all", "shared", "single", "high"]),
    goalId: z.string().uuid().optional(),
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

    const values =
      parsed.data.type === "message"
        ? {
            friendshipId,
            senderId: user.id,
            recipientId,
            type: parsed.data.type,
            body: parsed.data.body,
          }
        : {
            friendshipId,
            senderId: user.id,
            recipientId,
            type: parsed.data.type,
            body: parsed.data.body,
            streakDays: parsed.data.streakDays,
            streakPercent: parsed.data.streakPercent,
            goalScope: parsed.data.goalScope,
            goalId: parsed.data.goalId ?? null,
          };

    const [row] = await db.insert(friendMessages).values(values).returning();

    if (parsed.data.type === "incentive") {
      void sendPushToUser(recipientId, "notifySharedGoalInvites", {
        title: "New incentive",
        body: `${user.name} sent you an incentive challenge.`,
        data: { type: "incentive", friendshipId },
      });
    }

    const creditEvent =
      parsed.data.type === "incentive"
        ? await awardCreditAction(db, {
            actionDate: getLocalDateKeyFromRequest(request),
            actionType: "incentive_create",
            sourceId: row.id,
            sourceType: "friend_message",
            userId: user.id,
          })
        : null;

    return jsonWithCreditHeaders(row, [creditEvent], { status: 201 });
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

    void sendPushToUser(row.senderId, "notifyIncentiveEarned", {
      title: "Incentive accepted",
      body: `${user.name} accepted your incentive challenge.`,
      data: { type: "incentive_accepted", friendshipId },
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
