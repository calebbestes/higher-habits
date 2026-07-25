import {
  feedComments,
  feedProps,
  friends,
  getDb,
  goalLogPhotos,
  goalLogs,
  habits,
} from "@habit/db";
import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  awardCreditAction,
  getLocalDateKeyFromRequest,
  jsonWithCreditHeaders,
  reverseFloatCredits,
} from "@/lib/float-credits";
import { getGoalIdsTiedToFriend } from "@/lib/goal-visibility";
import { sendPushToUser } from "@/lib/push";

const interactionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("toggleProp"),
  }),
  z.object({
    type: z.literal("addComment"),
    body: z.string().trim().min(1).max(2_000),
    parentCommentId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    type: z.literal("deleteComment"),
    commentId: z.string().uuid(),
  }),
]);

const getDatabase = () => getDb() ?? null;
type FeedDb = NonNullable<ReturnType<typeof getDatabase>>;

async function findAccessibleFeedEntry(
  db: FeedDb,
  userId: string,
  goalLogId: string,
) {
  const [entry] = await db
    .select({
      id: goalLogs.id,
      ownerId: goalLogs.userId,
      goalId: habits.id,
      visibility: goalLogs.visibility,
      period: habits.period,
      priority: habits.priority,
      notes: goalLogs.notes,
    })
    .from(goalLogs)
    .innerJoin(habits, eq(goalLogs.goalId, habits.id))
    .where(
      and(
        eq(goalLogs.id, goalLogId),
        eq(goalLogs.status, "complete"),
        eq(habits.userId, goalLogs.userId),
      ),
    )
    .limit(1);

  if (!entry) {
    return null;
  }

  if (entry.ownerId === userId) {
    return entry;
  }

  if (!entry.notes.trim()) {
    const [photo] = await db
      .select({ id: goalLogPhotos.id })
      .from(goalLogPhotos)
      .where(
        and(
          eq(goalLogPhotos.goalLogId, entry.id),
          eq(goalLogPhotos.userId, entry.ownerId),
        ),
      )
      .limit(1);

    if (!photo) {
      return null;
    }
  }

  const [friendship] = await db
    .select({ id: friends.id })
    .from(friends)
    .where(
      and(
        eq(friends.status, "accepted"),
        or(
          and(eq(friends.userId1, userId), eq(friends.userId2, entry.ownerId)),
          and(eq(friends.userId2, userId), eq(friends.userId1, entry.ownerId)),
        ),
      ),
    )
    .limit(1);

  if (!friendship) {
    return null;
  }

  if (entry.visibility === "all_friends") {
    return entry;
  }

  if (entry.visibility === "only_me") {
    return null;
  }

  const relatedGoalIds = await getGoalIdsTiedToFriend(
    db,
    userId,
    entry.ownerId,
    [
      {
        id: entry.goalId,
        period: entry.period,
        priority: entry.priority,
      },
    ],
  );

  return relatedGoalIds.has(entry.goalId) ? entry : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ goalLogId: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { goalLogId: goalLogIdParam } = await params;
    const goalLogId = z.string().uuid().parse(goalLogIdParam);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const interaction = interactionSchema.parse(await request.json());
    const entry = await findAccessibleFeedEntry(db, user.id, goalLogId);

    if (!entry) {
      return NextResponse.json(
        { error: "Feed post not found." },
        { status: 404 },
      );
    }

    if (interaction.type === "toggleProp") {
      if (entry.ownerId === user.id) {
        return NextResponse.json(
          { error: "You cannot prop your own post." },
          { status: 400 },
        );
      }

      const [existingProp] = await db
        .select({ id: feedProps.id })
        .from(feedProps)
        .where(
          and(
            eq(feedProps.goalLogId, goalLogId),
            eq(feedProps.userId, user.id),
          ),
        )
        .limit(1);

      if (existingProp) {
        await db
          .delete(feedProps)
          .where(
            and(
              eq(feedProps.goalLogId, goalLogId),
              eq(feedProps.userId, user.id),
            ),
          );

        return NextResponse.json({ hasPropped: false });
      }

      await db
        .insert(feedProps)
        .values({ goalLogId, userId: user.id })
        .onConflictDoNothing();

      void sendPushToUser(entry.ownerId, "notifyPostProps", {
        title: "Someone propped your post",
        body: `${user.name} gave you props.`,
        data: { type: "post_prop", goalLogId },
      });

      return NextResponse.json({ hasPropped: true });
    }

    if (interaction.type === "addComment") {
      const parentCommentId = interaction.parentCommentId ?? null;
      const [parentComment] = parentCommentId
        ? await db
            .select({
              id: feedComments.id,
              userId: feedComments.userId,
            })
            .from(feedComments)
            .where(
              and(
                eq(feedComments.id, parentCommentId),
                eq(feedComments.goalLogId, goalLogId),
              ),
            )
            .limit(1)
        : [];

      if (parentCommentId && !parentComment) {
        return NextResponse.json(
          { error: "Parent comment not found." },
          { status: 404 },
        );
      }

      const [comment] = await db
        .insert(feedComments)
        .values({
          goalLogId,
          userId: user.id,
          parentCommentId,
          body: interaction.body,
        })
        .returning({ id: feedComments.id });

      const notificationUserId = parentComment?.userId ?? entry.ownerId;
      if (notificationUserId !== user.id) {
        void sendPushToUser(notificationUserId, "notifyPostComments", {
          title: parentComment
            ? "New reply to your comment"
            : "New comment on your post",
          body: `${user.name} ${
            parentComment ? "replied" : "commented"
          }: ${interaction.body.slice(0, 100)}`,
          data: { type: "post_comment", goalLogId },
        });
      }

      const creditEvent =
        entry.ownerId !== user.id
          ? await awardCreditAction(db, {
              actionDate: getLocalDateKeyFromRequest(request),
              actionType: "comment",
              sourceId: comment.id,
              sourceType: "feed_comment",
              userId: user.id,
            })
          : null;

      return jsonWithCreditHeaders(comment, [creditEvent], { status: 201 });
    }

    const [deletedComment] = await db
      .delete(feedComments)
      .where(
        and(
          eq(feedComments.id, interaction.commentId),
          eq(feedComments.goalLogId, goalLogId),
          eq(feedComments.userId, user.id),
        ),
      )
      .returning({ id: feedComments.id });

    if (!deletedComment) {
      return NextResponse.json(
        { error: "Comment not found." },
        { status: 404 },
      );
    }

    const creditEvent =
      entry.ownerId !== user.id
        ? await reverseFloatCredits(db, {
            actionType: "comment",
            sourceId: deletedComment.id,
            sourceType: "feed_comment",
            userId: user.id,
          })
        : null;

    return jsonWithCreditHeaders({ ok: true }, [creditEvent]);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Could not update feed post." },
      { status: 500 },
    );
  }
}
