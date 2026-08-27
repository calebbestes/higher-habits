import {
  dailyReflectionAudienceFriends,
  dailyReflectionAudienceGroups,
  dailyReflectionPosts,
  feedReposts,
  friendGroupMembers,
  friends,
  getDb,
  goalCheckpoints,
  goalLogs,
  goals,
  habits,
  socialFeedPosts,
} from "@habit/db";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { getGoalIdsTiedToFriend } from "@/lib/goal-visibility";

const getDatabase = () => getDb() ?? null;
type FeedDb = NonNullable<ReturnType<typeof getDatabase>>;

const sourceSchema = z.object({
  sourceType: z.enum([
    "goal_log",
    "goal_checkpoint",
    "reflection_post",
    "social_feed_post",
  ]),
  sourceId: z.string().uuid(),
});

async function hasAcceptedFriendship(
  db: FeedDb,
  userId: string,
  friendId: string,
) {
  if (userId === friendId) return true;

  const [friendship] = await db
    .select({ id: friends.id })
    .from(friends)
    .where(
      and(
        eq(friends.status, "accepted"),
        or(
          and(eq(friends.userId1, userId), eq(friends.userId2, friendId)),
          and(eq(friends.userId2, userId), eq(friends.userId1, friendId)),
        ),
      ),
    )
    .limit(1);

  return Boolean(friendship);
}

async function canRepostSource(
  db: FeedDb,
  userId: string,
  sourceType: z.infer<typeof sourceSchema>["sourceType"],
  sourceId: string,
) {
  if (sourceType === "goal_log") {
    const [entry] = await db
      .select({
        ownerId: goalLogs.userId,
        goalId: habits.id,
        visibility: goalLogs.visibility,
        period: habits.period,
        priority: habits.priority,
      })
      .from(goalLogs)
      .innerJoin(habits, eq(goalLogs.goalId, habits.id))
      .where(
        and(
          eq(goalLogs.id, sourceId),
          eq(goalLogs.status, "complete"),
          eq(habits.userId, goalLogs.userId),
        ),
      )
      .limit(1);

    if (!entry || !(await hasAcceptedFriendship(db, userId, entry.ownerId))) {
      return false;
    }
    if (entry.ownerId === userId || entry.visibility === "all_friends") {
      return true;
    }
    if (entry.visibility === "only_me") return false;

    const tiedGoalIds = await getGoalIdsTiedToFriend(
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
    return tiedGoalIds.has(entry.goalId);
  }

  if (sourceType === "goal_checkpoint") {
    const [entry] = await db
      .select({ ownerId: goalCheckpoints.userId })
      .from(goalCheckpoints)
      .innerJoin(goals, eq(goalCheckpoints.goalId, goals.id))
      .where(
        and(
          eq(goalCheckpoints.id, sourceId),
          isNotNull(goalCheckpoints.completedAt),
          eq(goalCheckpoints.visibility, "all_friends"),
          eq(goals.userId, goalCheckpoints.userId),
        ),
      )
      .limit(1);

    return Boolean(
      entry?.ownerId &&
        (await hasAcceptedFriendship(db, userId, entry.ownerId)),
    );
  }

  if (sourceType === "reflection_post") {
    const [entry] = await db
      .select({
        ownerId: dailyReflectionPosts.userId,
        visibility: dailyReflectionPosts.visibility,
      })
      .from(dailyReflectionPosts)
      .where(eq(dailyReflectionPosts.id, sourceId))
      .limit(1);

    if (!entry || !(await hasAcceptedFriendship(db, userId, entry.ownerId))) {
      return false;
    }
    if (entry.ownerId === userId || entry.visibility === "all_friends") {
      return true;
    }
    if (entry.visibility === "only_me") return false;

    const [directAudience, groupAudience] = await Promise.all([
      db
        .select({ id: dailyReflectionAudienceFriends.id })
        .from(dailyReflectionAudienceFriends)
        .where(
          and(
            eq(dailyReflectionAudienceFriends.reflectionPostId, sourceId),
            eq(dailyReflectionAudienceFriends.friendUserId, userId),
          ),
        )
        .limit(1),
      db
        .select({ id: dailyReflectionAudienceGroups.id })
        .from(dailyReflectionAudienceGroups)
        .innerJoin(
          friendGroupMembers,
          eq(dailyReflectionAudienceGroups.groupId, friendGroupMembers.groupId),
        )
        .where(
          and(
            eq(dailyReflectionAudienceGroups.reflectionPostId, sourceId),
            eq(friendGroupMembers.memberUserId, userId),
          ),
        )
        .limit(1),
    ]);

    return directAudience.length > 0 || groupAudience.length > 0;
  }

  const [entry] = await db
    .select({
      ownerId: socialFeedPosts.userId,
      targetUserId: socialFeedPosts.targetUserId,
      kind: socialFeedPosts.kind,
    })
    .from(socialFeedPosts)
    .where(eq(socialFeedPosts.id, sourceId))
    .limit(1);

  if (
    !entry ||
    (entry.kind !== "incentive" && entry.kind !== "shared_goal") ||
    !(await hasAcceptedFriendship(db, userId, entry.ownerId))
  ) {
    return false;
  }

  return (
    entry.ownerId === userId ||
    entry.targetUserId === null ||
    entry.targetUserId === userId
  );
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

    const parsed = sourceSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid repost source." },
        { status: 400 },
      );
    }

    const { sourceType, sourceId } = parsed.data;
    if (!(await canRepostSource(db, user.id, sourceType, sourceId))) {
      return NextResponse.json(
        { error: "That post is no longer available to repost." },
        { status: 404 },
      );
    }

    const result = await db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(feedReposts)
        .where(
          and(
            eq(feedReposts.userId, user.id),
            eq(feedReposts.sourceType, sourceType),
            eq(feedReposts.sourceId, sourceId),
          ),
        )
        .returning({ id: feedReposts.id });

      if (removed) {
        await tx
          .delete(socialFeedPosts)
          .where(
            and(
              eq(socialFeedPosts.kind, "repost"),
              eq(socialFeedPosts.sourceType, "repost"),
              eq(socialFeedPosts.sourceId, removed.id),
            ),
          );
        return { reposted: false, repostId: null };
      }

      const [repost] = await tx
        .insert(feedReposts)
        .values({ userId: user.id, sourceType, sourceId })
        .onConflictDoNothing()
        .returning({ id: feedReposts.id });

      if (!repost) {
        const [existing] = await tx
          .select({ id: feedReposts.id })
          .from(feedReposts)
          .where(
            and(
              eq(feedReposts.userId, user.id),
              eq(feedReposts.sourceType, sourceType),
              eq(feedReposts.sourceId, sourceId),
            ),
          )
          .limit(1);
        return { reposted: true, repostId: existing?.id ?? null };
      }

      await tx.insert(socialFeedPosts).values({
        userId: user.id,
        kind: "repost",
        sourceType: "repost",
        sourceId: repost.id,
        title: "Reposted a post",
        body: "",
      });

      return { reposted: true, repostId: repost.id };
    });

    return NextResponse.json(result);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Could not update repost." },
      { status: 500 },
    );
  }
}
