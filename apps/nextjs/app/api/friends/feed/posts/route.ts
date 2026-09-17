import {
  friendGroups,
  friends,
  getDb,
  goals,
  habits,
  socialFeedPostAudienceFriends,
  socialFeedPostAudienceGroups,
  socialFeedPostPhotos,
  socialFeedPosts,
} from "@habit/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  GOAL_PHOTOS_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 4;
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const createPostSchema = z.object({
  caption: z.string().trim().max(20_000),
  visibility: z
    .enum(["only_me", "goal_friends", "all_friends"])
    .default("all_friends"),
  audienceFriendIds: z.array(z.string().min(1)).max(100).default([]),
  audienceGroupIds: z.array(z.string().uuid()).max(50).default([]),
  linkedType: z.enum(["habit", "goal"]),
  linkedId: z.string().uuid(),
});

const getDatabase = () => getDb() ?? null;

function parseArrayField(value: FormDataEntryValue | null) {
  if (value === null) return [];
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function validateAudience(
  db: NonNullable<ReturnType<typeof getDb>>,
  userId: string,
  friendIds: string[],
  groupIds: string[],
) {
  const friendRows = await db
    .select({ userId1: friends.userId1, userId2: friends.userId2 })
    .from(friends)
    .where(
      and(
        eq(friends.status, "accepted"),
        or(eq(friends.userId1, userId), eq(friends.userId2, userId)),
      ),
    );
  const acceptedFriendIds = new Set(
    friendRows.map((friend) =>
      friend.userId1 === userId ? friend.userId2 : friend.userId1,
    ),
  );
  const audienceFriendIds = [...new Set(friendIds)].filter(
    (friendId) => friendId !== userId,
  );
  if (audienceFriendIds.some((friendId) => !acceptedFriendIds.has(friendId))) {
    return null;
  }

  const audienceGroupIds = [...new Set(groupIds)];
  const groupRows = audienceGroupIds.length
    ? await db
        .select({ id: friendGroups.id })
        .from(friendGroups)
        .where(
          and(
            eq(friendGroups.ownerId, userId),
            inArray(friendGroups.id, audienceGroupIds),
          ),
        )
    : [];
  if (groupRows.length !== audienceGroupIds.length) return null;

  return { audienceFriendIds, audienceGroupIds };
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

    const formData = await request.formData();
    const data = createPostSchema.parse({
      caption: formData.get("caption") ?? "",
      visibility: formData.get("visibility") ?? undefined,
      audienceFriendIds: parseArrayField(formData.get("audienceFriendIds")),
      audienceGroupIds: parseArrayField(formData.get("audienceGroupIds")),
      linkedType: formData.get("linkedType"),
      linkedId: formData.get("linkedId"),
    });
    const files = formData
      .getAll("files")
      .filter(
        (value): value is File => value instanceof File && value.size > 0,
      );

    if (!data.caption && files.length === 0) {
      return NextResponse.json(
        { error: "Add a caption or photo before posting." },
        { status: 400 },
      );
    }
    if (files.length > MAX_PHOTOS) {
      return NextResponse.json(
        { error: `Choose ${MAX_PHOTOS} photos or fewer.` },
        { status: 400 },
      );
    }

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

    for (const file of files) {
      if (!CONTENT_TYPE_EXTENSIONS[file.type]) {
        return NextResponse.json(
          { error: "Photos must be JPEG, PNG, or WebP." },
          { status: 400 },
        );
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json(
          { error: "Photos must be 5 MB or smaller." },
          { status: 400 },
        );
      }
    }

    const linkedItem =
      data.linkedType === "habit"
        ? await db
            .select({ id: habits.id, name: habits.name })
            .from(habits)
            .where(
              and(eq(habits.id, data.linkedId), eq(habits.userId, user.id)),
            )
            .limit(1)
        : await db
            .select({ id: goals.id, name: goals.title })
            .from(goals)
            .where(and(eq(goals.id, data.linkedId), eq(goals.userId, user.id)))
            .limit(1);
    const item = linkedItem[0];

    if (!item) {
      return NextResponse.json(
        {
          error: `${data.linkedType === "habit" ? "Habit" : "Goal"} not found.`,
        },
        { status: 404 },
      );
    }

    const postId = crypto.randomUUID();
    await db.insert(socialFeedPosts).values({
      id: postId,
      userId: user.id,
      targetUserId: data.visibility === "only_me" ? user.id : null,
      kind: "post",
      sourceType: "user_post",
      sourceId: postId,
      visibility: data.visibility,
      linkedType: data.linkedType,
      linkedId: data.linkedId,
      title: item.name,
      body: data.caption,
    });

    if (data.visibility === "goal_friends") {
      await Promise.all([
        audience.audienceFriendIds.length
          ? db.insert(socialFeedPostAudienceFriends).values(
              audience.audienceFriendIds.map((friendUserId) => ({
                socialFeedPostId: postId,
                userId: user.id,
                friendUserId,
              })),
            )
          : Promise.resolve(),
        audience.audienceGroupIds.length
          ? db.insert(socialFeedPostAudienceGroups).values(
              audience.audienceGroupIds.map((groupId) => ({
                socialFeedPostId: postId,
                userId: user.id,
                groupId,
              })),
            )
          : Promise.resolve(),
      ]);
    }

    if (files.length === 0) {
      return NextResponse.json({ id: postId }, { status: 201 });
    }

    const safeUserId = user.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const uploadedPaths: string[] = [];
    let storage: ReturnType<typeof getSupabaseStorageAdmin> | null = null;

    try {
      storage = getSupabaseStorageAdmin();
      for (const file of files) {
        const extension = CONTENT_TYPE_EXTENSIONS[file.type];
        const storagePath = `${safeUserId}/feed-posts/${postId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await storage.storage
          .from(GOAL_PHOTOS_BUCKET)
          .upload(storagePath, await file.arrayBuffer(), {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Could not upload photo: ${uploadError.message}`);
        }

        uploadedPaths.push(storagePath);
        await db.insert(socialFeedPostPhotos).values({
          socialFeedPostId: postId,
          userId: user.id,
          storagePath,
          contentType: file.type,
        });
      }
    } catch (error) {
      if (storage) {
        const storageClient = storage;
        await Promise.all(
          uploadedPaths.map((storagePath) =>
            storageClient.storage
              .from(GOAL_PHOTOS_BUCKET)
              .remove([storagePath]),
          ),
        );
      }
      await db.delete(socialFeedPosts).where(eq(socialFeedPosts.id, postId));
      throw error;
    }

    return NextResponse.json({ id: postId }, { status: 201 });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      error.message === "Supabase Storage is not configured."
    ) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create post.",
      },
      { status: 500 },
    );
  }
}
