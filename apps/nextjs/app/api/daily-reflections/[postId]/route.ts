import {
  dailyReflectionAudienceFriends,
  dailyReflectionAudienceGroups,
  dailyReflectionComments,
  dailyReflectionPosts,
  dailyReflectionProps,
  friendGroupMembers,
  friends,
  getDb,
} from "@habit/db";
import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  getAcceptedFriendIds,
  syncContentMentionsAndNotify,
} from "@/lib/mentions";
import { sendPushToUser } from "@/lib/push";

const interactionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("toggleProp"),
  }),
  z.object({
    type: z.literal("setBody"),
    body: z.string().trim().min(1).max(5_000),
  }),
  z.object({
    type: z.literal("setVisibility"),
    visibility: z.enum(["only_me", "goal_friends", "all_friends"]),
  }),
  z.object({
    type: z.literal("deletePost"),
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

async function findAccessibleReflectionPost(
  db: FeedDb,
  userId: string,
  postId: string,
) {
  const [post] = await db
    .select({
      id: dailyReflectionPosts.id,
      ownerId: dailyReflectionPosts.userId,
      visibility: dailyReflectionPosts.visibility,
      body: dailyReflectionPosts.body,
    })
    .from(dailyReflectionPosts)
    .where(eq(dailyReflectionPosts.id, postId))
    .limit(1);

  if (!post) return null;
  if (post.ownerId === userId) return post;
  if (post.visibility === "only_me") return null;

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

  if (!friendship) return null;
  if (post.visibility === "all_friends") return post;

  const [audienceFriend] = await db
    .select({ id: dailyReflectionAudienceFriends.id })
    .from(dailyReflectionAudienceFriends)
    .where(
      and(
        eq(dailyReflectionAudienceFriends.reflectionPostId, postId),
        eq(dailyReflectionAudienceFriends.friendUserId, userId),
      ),
    )
    .limit(1);

  if (audienceFriend) return post;

  const [audienceGroup] = await db
    .select({ id: dailyReflectionAudienceGroups.id })
    .from(dailyReflectionAudienceGroups)
    .innerJoin(
      friendGroupMembers,
      eq(dailyReflectionAudienceGroups.groupId, friendGroupMembers.groupId),
    )
    .where(
      and(
        eq(dailyReflectionAudienceGroups.reflectionPostId, postId),
        eq(friendGroupMembers.memberUserId, userId),
      ),
    )
    .limit(1);

  return audienceGroup ? post : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { postId: postIdParam } = await params;
    const postId = z.string().uuid().parse(postIdParam);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const interaction = interactionSchema.parse(await request.json());
    const post = await findAccessibleReflectionPost(db, user.id, postId);

    if (!post) {
      return NextResponse.json(
        { error: "Reflection post not found." },
        { status: 404 },
      );
    }

    if (interaction.type === "toggleProp") {
      if (post.ownerId === user.id) {
        return NextResponse.json(
          { error: "You cannot prop your own post." },
          { status: 400 },
        );
      }

      const [existingProp] = await db
        .select({ id: dailyReflectionProps.id })
        .from(dailyReflectionProps)
        .where(
          and(
            eq(dailyReflectionProps.reflectionPostId, postId),
            eq(dailyReflectionProps.userId, user.id),
          ),
        )
        .limit(1);

      if (existingProp) {
        await db
          .delete(dailyReflectionProps)
          .where(
            and(
              eq(dailyReflectionProps.reflectionPostId, postId),
              eq(dailyReflectionProps.userId, user.id),
            ),
          );

        return NextResponse.json({ hasPropped: false });
      }

      await db
        .insert(dailyReflectionProps)
        .values({ reflectionPostId: postId, userId: user.id })
        .onConflictDoNothing();

      await sendPushToUser(post.ownerId, "notifyPostProps", {
        title: "Someone propped your reflection",
        body: `${user.name} gave you props.`,
        data: { type: "post_prop", reflectionPostId: postId },
      });

      return NextResponse.json({ hasPropped: true });
    }

    if (interaction.type === "setBody") {
      if (post.ownerId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await db
        .update(dailyReflectionPosts)
        .set({ body: interaction.body, updatedAt: new Date() })
        .where(eq(dailyReflectionPosts.id, postId));

      await syncContentMentionsAndNotify({
        allowedUserIds:
          post.visibility === "only_me"
            ? new Set()
            : new Set(await getAcceptedFriendIds(db, post.ownerId)),
        authorId: post.ownerId,
        authorName: user.name,
        body: interaction.body,
        db,
        sourceId: postId,
        sourceType: "reflection_post",
      });

      return NextResponse.json({ ok: true });
    }

    if (interaction.type === "setVisibility") {
      if (post.ownerId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await db
        .update(dailyReflectionPosts)
        .set({ visibility: interaction.visibility, updatedAt: new Date() })
        .where(eq(dailyReflectionPosts.id, postId));

      await syncContentMentionsAndNotify({
        allowedUserIds:
          interaction.visibility === "only_me"
            ? new Set()
            : new Set(await getAcceptedFriendIds(db, post.ownerId)),
        authorId: post.ownerId,
        authorName: user.name,
        body: post.body,
        db,
        sourceId: postId,
        sourceType: "reflection_post",
      });

      return NextResponse.json({ ok: true });
    }

    if (interaction.type === "deletePost") {
      if (post.ownerId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await db
        .delete(dailyReflectionPosts)
        .where(eq(dailyReflectionPosts.id, postId));

      return NextResponse.json({ ok: true });
    }

    if (interaction.type === "addComment") {
      const parentCommentId = interaction.parentCommentId ?? null;
      const [parentComment] = parentCommentId
        ? await db
            .select({
              id: dailyReflectionComments.id,
              userId: dailyReflectionComments.userId,
            })
            .from(dailyReflectionComments)
            .where(
              and(
                eq(dailyReflectionComments.id, parentCommentId),
                eq(dailyReflectionComments.reflectionPostId, postId),
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
        .insert(dailyReflectionComments)
        .values({
          reflectionPostId: postId,
          userId: user.id,
          parentCommentId,
          body: interaction.body,
        })
        .returning({ id: dailyReflectionComments.id });

      await syncContentMentionsAndNotify({
        authorId: user.id,
        authorName: user.name,
        body: interaction.body,
        db,
        sourceId: comment.id,
        sourceType: "reflection_comment",
      });

      const notificationUserId = parentComment?.userId ?? post.ownerId;
      if (notificationUserId !== user.id) {
        await sendPushToUser(notificationUserId, "notifyPostComments", {
          title: parentComment
            ? "New reply to your comment"
            : "New comment on your reflection",
          body: `${user.name} ${
            parentComment ? "replied" : "commented"
          }: ${interaction.body.slice(0, 100)}`,
          data: { type: "post_comment", reflectionPostId: postId },
        });
      }

      return NextResponse.json(comment, { status: 201 });
    }

    const [deletedComment] = await db
      .delete(dailyReflectionComments)
      .where(
        and(
          eq(dailyReflectionComments.id, interaction.commentId),
          eq(dailyReflectionComments.reflectionPostId, postId),
          eq(dailyReflectionComments.userId, user.id),
        ),
      )
      .returning({ id: dailyReflectionComments.id });

    if (!deletedComment) {
      return NextResponse.json(
        { error: "Comment not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Could not update reflection." },
      { status: 500 },
    );
  }
}
