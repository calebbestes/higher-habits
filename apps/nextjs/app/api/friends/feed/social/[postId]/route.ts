import {
  friends,
  getDb,
  sharedGoalParticipants,
  sharedGoals,
  socialFeedPostComments,
  socialFeedPostProps,
  socialFeedPosts,
} from "@habit/db";
import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { syncContentMentionsAndNotify } from "@/lib/mentions";
import { sendPushToUser } from "@/lib/push";

const interactionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("toggleProp") }),
  z.object({
    type: z.literal("addComment"),
    body: z.string().trim().min(1).max(2_000),
    parentCommentId: z.string().uuid().nullable().optional(),
  }),
  z.object({ type: z.literal("deleteComment"), commentId: z.string().uuid() }),
]);

const getDatabase = () => getDb() ?? null;
type FeedDb = NonNullable<ReturnType<typeof getDatabase>>;

async function findAccessibleSocialPost(
  db: FeedDb,
  userId: string,
  postId: string,
) {
  const [post] = await db
    .select({
      id: socialFeedPosts.id,
      ownerId: socialFeedPosts.userId,
      sharedGoalId: sharedGoals.id,
    })
    .from(socialFeedPosts)
    .leftJoin(sharedGoals, eq(socialFeedPosts.sourceId, sharedGoals.id))
    .where(
      and(
        eq(socialFeedPosts.id, postId),
        eq(socialFeedPosts.kind, "shared_goal"),
        eq(socialFeedPosts.sourceType, "shared_goal"),
      ),
    )
    .limit(1);

  if (!post?.sharedGoalId) return null;
  if (post.ownerId === userId) return post;

  const [membership] = await db
    .select({ id: sharedGoalParticipants.id })
    .from(sharedGoalParticipants)
    .where(
      and(
        eq(sharedGoalParticipants.sharedGoalId, post.sharedGoalId),
        eq(sharedGoalParticipants.userId, userId),
        or(
          eq(sharedGoalParticipants.status, "invited"),
          eq(sharedGoalParticipants.status, "accepted"),
        ),
      ),
    )
    .limit(1);
  if (!membership) return null;

  const [friendship] = await db
    .select({ id: friends.id })
    .from(friends)
    .where(
      and(
        eq(friends.status, "accepted"),
        or(
          and(eq(friends.userId1, userId), eq(friends.userId2, post.ownerId)),
          and(eq(friends.userId2, userId), eq(friends.userId1, post.ownerId)),
        ),
      ),
    )
    .limit(1);

  return friendship ? post : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();
    const { postId } = await params;

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const post = await findAccessibleSocialPost(db, user.id, postId);
    if (!post) {
      return NextResponse.json(
        { error: "Feed post not found." },
        { status: 404 },
      );
    }

    const interaction = interactionSchema.parse(await request.json());

    if (interaction.type === "toggleProp") {
      if (post.ownerId === user.id) {
        return NextResponse.json(
          { error: "You cannot prop your own post." },
          { status: 400 },
        );
      }

      const [existingProp] = await db
        .select({ id: socialFeedPostProps.id })
        .from(socialFeedPostProps)
        .where(
          and(
            eq(socialFeedPostProps.socialFeedPostId, postId),
            eq(socialFeedPostProps.userId, user.id),
          ),
        )
        .limit(1);

      if (existingProp) {
        await db
          .delete(socialFeedPostProps)
          .where(
            and(
              eq(socialFeedPostProps.socialFeedPostId, postId),
              eq(socialFeedPostProps.userId, user.id),
            ),
          );
        return NextResponse.json({ hasPropped: false });
      }

      await db
        .insert(socialFeedPostProps)
        .values({ socialFeedPostId: postId, userId: user.id })
        .onConflictDoNothing();
      await sendPushToUser(post.ownerId, "notifyPostProps", {
        title: "Someone propped your post",
        body: `${user.name} gave you props.`,
        data: { type: "post_prop", socialFeedPostId: postId },
      });
      return NextResponse.json({ hasPropped: true });
    }

    if (interaction.type === "addComment") {
      const parentCommentId = interaction.parentCommentId ?? null;
      const [parentComment] = parentCommentId
        ? await db
            .select({
              id: socialFeedPostComments.id,
              userId: socialFeedPostComments.userId,
            })
            .from(socialFeedPostComments)
            .where(
              and(
                eq(socialFeedPostComments.id, parentCommentId),
                eq(socialFeedPostComments.socialFeedPostId, postId),
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
        .insert(socialFeedPostComments)
        .values({
          socialFeedPostId: postId,
          userId: user.id,
          parentCommentId,
          body: interaction.body,
        })
        .returning({ id: socialFeedPostComments.id });
      if (!comment) throw new Error("Comment insert failed.");

      await syncContentMentionsAndNotify({
        authorId: user.id,
        authorName: user.name,
        body: interaction.body,
        db,
        sourceId: comment.id,
        sourceType: "feed_comment",
      });

      const notificationUserId = parentComment?.userId ?? post.ownerId;
      if (notificationUserId !== user.id) {
        await sendPushToUser(notificationUserId, "notifyPostComments", {
          title: parentComment
            ? "New reply to your comment"
            : "New comment on your post",
          body: `${user.name} ${parentComment ? "replied" : "commented"}: ${interaction.body.slice(0, 100)}`,
          data: { type: "post_comment", socialFeedPostId: postId },
        });
      }

      return NextResponse.json(comment, { status: 201 });
    }

    const [deletedComment] = await db
      .delete(socialFeedPostComments)
      .where(
        and(
          eq(socialFeedPostComments.id, interaction.commentId),
          eq(socialFeedPostComments.socialFeedPostId, postId),
          eq(socialFeedPostComments.userId, user.id),
        ),
      )
      .returning({ id: socialFeedPostComments.id });

    if (!deletedComment) {
      return NextResponse.json(
        { error: "Comment not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not update feed post." },
      { status: 500 },
    );
  }
}
