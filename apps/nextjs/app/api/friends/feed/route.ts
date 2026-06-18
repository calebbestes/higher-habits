import {
  feedComments,
  feedProps,
  friends,
  getDb,
  goalLogPhotos,
  goalLogs,
  habits,
  users,
} from "@habit/db";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { getGoalIdsTiedToFriend } from "@/lib/goal-visibility";
import {
  GOAL_PHOTOS_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

const getDatabase = () => getDb() ?? null;

async function createSignedPhotoUrl(storagePath: string) {
  const storage = getSupabaseStorageAdmin();
  const { data, error } = await storage.storage
    .from(GOAL_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) {
    throw new Error(`Could not open photo: ${error.message}`);
  }

  return data.signedUrl;
}

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

    const friendRows = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
      })
      .from(friends)
      .innerJoin(
        users,
        or(
          and(eq(friends.userId1, user.id), eq(friends.userId2, users.id)),
          and(eq(friends.userId2, user.id), eq(friends.userId1, users.id)),
        ),
      )
      .where(
        and(
          eq(friends.status, "accepted"),
          or(eq(friends.userId1, user.id), eq(friends.userId2, user.id)),
        ),
      );

    const friendsById = new Map(
      friendRows.map((friend) => [friend.id, friend]),
    );
    const friendIds = [...friendsById.keys()];

    if (friendIds.length === 0) {
      return NextResponse.json([]);
    }

    const logRows = await db
      .select({
        entryId: goalLogs.id,
        friendId: goalLogs.userId,
        goalId: habits.id,
        goalName: habits.name,
        goalIcon: habits.iconKey,
        visibility: goalLogs.visibility,
        goalPeriod: habits.period,
        goalPriority: habits.priority,
        dateKey: goalLogs.date,
        notes: goalLogs.notes,
        updatedAt: goalLogs.updatedAt,
      })
      .from(goalLogs)
      .innerJoin(habits, eq(goalLogs.goalId, habits.id))
      .where(
        and(
          inArray(goalLogs.userId, friendIds),
          eq(goalLogs.status, "complete"),
          eq(habits.userId, goalLogs.userId),
        ),
      )
      .orderBy(desc(goalLogs.updatedAt), desc(goalLogs.date));

    const goalRowsByFriendId = new Map<
      string,
      Map<
        string,
        {
          id: string;
          period: (typeof habits.period.enumValues)[number];
          priority: (typeof habits.priority.enumValues)[number];
        }
      >
    >();
    for (const row of logRows) {
      const goalsById =
        goalRowsByFriendId.get(row.friendId) ??
        new Map<
          string,
          {
            id: string;
            period: (typeof habits.period.enumValues)[number];
            priority: (typeof habits.priority.enumValues)[number];
          }
        >();
      goalsById.set(row.goalId, {
        id: row.goalId,
        period: row.goalPeriod,
        priority: row.goalPriority,
      });
      goalRowsByFriendId.set(row.friendId, goalsById);
    }

    const tiedGoalIdsByFriendId = new Map<string, Set<string>>();
    await Promise.all(
      [...goalRowsByFriendId.entries()].map(async ([friendId, goalsById]) => {
        tiedGoalIdsByFriendId.set(
          friendId,
          await getGoalIdsTiedToFriend(db, user.id, friendId, [
            ...goalsById.values(),
          ]),
        );
      }),
    );
    const visibleLogRows = logRows.filter(
      (row) =>
        row.visibility === "all_friends" ||
        (row.visibility === "goal_friends" &&
          tiedGoalIdsByFriendId.get(row.friendId)?.has(row.goalId)),
    );
    const visibleLogIds = visibleLogRows.map((row) => row.entryId);
    const photoRows =
      visibleLogIds.length > 0
        ? await db
            .select({
              entryId: goalLogPhotos.goalLogId,
              photoId: goalLogPhotos.id,
              storagePath: goalLogPhotos.storagePath,
              contentType: goalLogPhotos.contentType,
              photoCreatedAt: goalLogPhotos.createdAt,
            })
            .from(goalLogPhotos)
            .where(inArray(goalLogPhotos.goalLogId, visibleLogIds))
            .orderBy(desc(goalLogPhotos.createdAt))
        : [];

    const signedPhotoRows = await Promise.all(
      photoRows.map(async (row) => ({
        ...row,
        url: await createSignedPhotoUrl(row.storagePath),
      })),
    );
    const photosByLogId = signedPhotoRows.reduce<
      Map<
        string,
        Array<{
          id: string;
          url: string;
          contentType: string;
          createdAt: string;
        }>
      >
    >((photosByLog, row) => {
      const photos = photosByLog.get(row.entryId) ?? [];
      photos.push({
        id: row.photoId,
        url: row.url,
        contentType: row.contentType,
        createdAt: row.photoCreatedAt.toISOString(),
      });
      photosByLog.set(row.entryId, photos);
      return photosByLog;
    }, new Map());

    const entries = new Map<
      string,
      {
        id: string;
        friend: { id: string; name: string; image: string | null };
        goal: { id: string; name: string; icon: string };
        dateKey: string;
        notes: string;
        updatedAt: string;
        props: {
          count: number;
          hasPropped: boolean;
        };
        comments: Array<{
          id: string;
          userId: string;
          authorName: string;
          authorImage: string | null;
          body: string;
          createdAt: string;
          updatedAt: string;
          canDelete: boolean;
        }>;
        photos: Array<{
          id: string;
          url: string;
          contentType: string;
          createdAt: string;
        }>;
      }
    >();

    for (const row of visibleLogRows) {
      const friend = friendsById.get(row.friendId);
      if (!friend) continue;
      const photos = photosByLogId.get(row.entryId) ?? [];
      if (!row.notes.trim() && photos.length === 0) continue;

      entries.set(row.entryId, {
        id: row.entryId,
        friend,
        goal: {
          id: row.goalId,
          name: row.goalName,
          icon: row.goalIcon || "mdi:circle",
        },
        dateKey: row.dateKey,
        notes: row.notes,
        updatedAt: row.updatedAt.toISOString(),
        props: {
          count: 0,
          hasPropped: false,
        },
        comments: [],
        photos,
      });
    }

    const entryIds = [...entries.keys()];

    if (entryIds.length > 0) {
      const [propRows, commentRows] = await Promise.all([
        db
          .select({
            goalLogId: feedProps.goalLogId,
            userId: feedProps.userId,
          })
          .from(feedProps)
          .where(inArray(feedProps.goalLogId, entryIds)),
        db
          .select({
            id: feedComments.id,
            goalLogId: feedComments.goalLogId,
            userId: feedComments.userId,
            authorName: users.name,
            authorImage: users.image,
            body: feedComments.body,
            createdAt: feedComments.createdAt,
            updatedAt: feedComments.updatedAt,
          })
          .from(feedComments)
          .innerJoin(users, eq(feedComments.userId, users.id))
          .where(inArray(feedComments.goalLogId, entryIds))
          .orderBy(asc(feedComments.createdAt)),
      ]);

      for (const prop of propRows) {
        const entry = entries.get(prop.goalLogId);
        if (!entry) continue;

        entry.props.count += 1;
        if (prop.userId === user.id) {
          entry.props.hasPropped = true;
        }
      }

      for (const comment of commentRows) {
        const entry = entries.get(comment.goalLogId);
        if (!entry) continue;

        entry.comments.push({
          id: comment.id,
          userId: comment.userId,
          authorName: comment.authorName,
          authorImage: comment.authorImage,
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
          canDelete: comment.userId === user.id,
        });
      }
    }

    return NextResponse.json([...entries.values()]);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
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
          error instanceof Error
            ? error.message
            : "Could not load friends feed",
      },
      { status: 500 },
    );
  }
}
