import {
  dailyReflectionAudienceFriends,
  dailyReflectionAudienceGroups,
  dailyReflectionPosts,
  friendGroupMembers,
  friendGroups,
  friends,
  getDb,
} from "@habit/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { syncContentMentionsAndNotify } from "@/lib/mentions";
import { sendPushToUser } from "@/lib/push";

const createReflectionSchema = z.object({
  prompt: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(5_000),
  visibility: z
    .enum(["only_me", "goal_friends", "all_friends"])
    .default("all_friends"),
  audienceFriendIds: z.array(z.string().min(1)).max(100).default([]),
  audienceGroupIds: z.array(z.string().uuid()).max(50).default([]),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type ReflectionDb = NonNullable<ReturnType<typeof getDb>>;

async function getAcceptedFriendIds(db: ReflectionDb, userId: string) {
  const friendRows = await db
    .select({
      userId1: friends.userId1,
      userId2: friends.userId2,
    })
    .from(friends)
    .where(
      and(
        eq(friends.status, "accepted"),
        or(eq(friends.userId1, userId), eq(friends.userId2, userId)),
      ),
    );

  return friendRows.map((friendship) =>
    friendship.userId1 === userId ? friendship.userId2 : friendship.userId1,
  );
}

async function validateAudience(
  db: ReflectionDb,
  userId: string,
  friendIds: string[],
  groupIds: string[],
) {
  const acceptedFriendIds = new Set(await getAcceptedFriendIds(db, userId));
  const uniqueFriendIds = [...new Set(friendIds)].filter(
    (friendId) => friendId !== userId,
  );

  if (uniqueFriendIds.some((friendId) => !acceptedFriendIds.has(friendId))) {
    return null;
  }

  const uniqueGroupIds = [...new Set(groupIds)];
  const groupRows = uniqueGroupIds.length
    ? await db
        .select({ id: friendGroups.id })
        .from(friendGroups)
        .where(
          and(
            eq(friendGroups.ownerId, userId),
            inArray(friendGroups.id, uniqueGroupIds),
          ),
        )
    : [];

  if (groupRows.length !== uniqueGroupIds.length) {
    return null;
  }

  return {
    acceptedFriendIds,
    audienceFriendIds: uniqueFriendIds,
    audienceGroupIds: uniqueGroupIds,
  };
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const data = createReflectionSchema.parse(await request.json());
    const audience = await validateAudience(
      db,
      user.id,
      data.audienceFriendIds,
      data.audienceGroupIds,
    );

    if (!audience) {
      return NextResponse.json(
        { error: "Selected friends are no longer available." },
        { status: 400 },
      );
    }

    if (
      data.visibility === "goal_friends" &&
      audience.audienceFriendIds.length === 0 &&
      audience.audienceGroupIds.length === 0
    ) {
      return NextResponse.json(
        { error: "Select at least one friend or group." },
        { status: 400 },
      );
    }

    const now = new Date();
    const [post] = await db
      .insert(dailyReflectionPosts)
      .values({
        userId: user.id,
        prompt: data.prompt,
        body: data.body,
        visibility: data.visibility,
        date: data.date ?? todayKey(),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: dailyReflectionPosts.id });

    if (data.visibility === "goal_friends") {
      await Promise.all([
        audience.audienceFriendIds.length
          ? db.insert(dailyReflectionAudienceFriends).values(
              audience.audienceFriendIds.map((friendUserId) => ({
                reflectionPostId: post.id,
                userId: user.id,
                friendUserId,
              })),
            )
          : Promise.resolve(),
        audience.audienceGroupIds.length
          ? db.insert(dailyReflectionAudienceGroups).values(
              audience.audienceGroupIds.map((groupId) => ({
                reflectionPostId: post.id,
                userId: user.id,
                groupId,
              })),
            )
          : Promise.resolve(),
      ]);
    }

    const notificationFriendIds =
      data.visibility === "all_friends"
        ? audience.acceptedFriendIds
        : data.visibility === "goal_friends"
          ? [
              ...new Set([
                ...audience.audienceFriendIds,
                ...(audience.audienceGroupIds.length
                  ? (
                      await db
                        .select({
                          memberUserId: friendGroupMembers.memberUserId,
                        })
                        .from(friendGroupMembers)
                        .where(
                          inArray(
                            friendGroupMembers.groupId,
                            audience.audienceGroupIds,
                          ),
                        )
                    ).flatMap((row) =>
                      audience.acceptedFriendIds.has(row.memberUserId)
                        ? [row.memberUserId]
                        : [],
                    )
                  : []),
              ]),
            ]
          : [];

    await syncContentMentionsAndNotify({
      allowedUserIds: new Set(notificationFriendIds),
      authorId: user.id,
      authorName: user.name,
      body: data.body,
      db,
      sourceId: post.id,
      sourceType: "reflection_post",
    });

    if (data.visibility !== "only_me") {
      await Promise.all(
        [...notificationFriendIds].map((friendId) =>
          sendPushToUser(friendId, "notifyFriendPosts", {
            title: `${user.name} posted a reflection`,
            body: data.body.slice(0, 100),
            data: { type: "friend_post", reflectionPostId: post.id },
          }),
        ),
      );
    }

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Could not create reflection." },
      { status: 500 },
    );
  }
}
