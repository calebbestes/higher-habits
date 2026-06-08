import {
  friends,
  getDb,
  goalLogPhotos,
  goalLogs,
  goals,
  users,
} from "@habit/db";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
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

    const photoRows = await db
      .select({
        entryId: goalLogs.id,
        friendId: goalLogs.userId,
        goalId: goals.id,
        goalName: goals.name,
        goalIcon: goals.iconKey,
        dateKey: goalLogs.date,
        notes: goalLogs.notes,
        updatedAt: goalLogs.updatedAt,
        photoId: goalLogPhotos.id,
        storagePath: goalLogPhotos.storagePath,
        contentType: goalLogPhotos.contentType,
        photoCreatedAt: goalLogPhotos.createdAt,
      })
      .from(goalLogPhotos)
      .innerJoin(goalLogs, eq(goalLogPhotos.goalLogId, goalLogs.id))
      .innerJoin(goals, eq(goalLogs.goalId, goals.id))
      .where(
        and(
          inArray(goalLogs.userId, friendIds),
          eq(goalLogs.status, "complete"),
          eq(goalLogPhotos.userId, goalLogs.userId),
          eq(goals.userId, goalLogs.userId),
        ),
      )
      .orderBy(
        desc(goalLogs.updatedAt),
        desc(goalLogs.date),
        desc(goalLogPhotos.createdAt),
      );

    const signedPhotoRows = await Promise.all(
      photoRows.map(async (row) => ({
        ...row,
        url: await createSignedPhotoUrl(row.storagePath),
      })),
    );
    const entries = new Map<
      string,
      {
        id: string;
        friend: { id: string; name: string; image: string | null };
        goal: { id: string; name: string; icon: string };
        dateKey: string;
        notes: string;
        updatedAt: string;
        photos: Array<{
          id: string;
          url: string;
          contentType: string;
          createdAt: string;
        }>;
      }
    >();

    for (const row of signedPhotoRows) {
      const friend = friendsById.get(row.friendId);
      if (!friend) continue;

      const photo = {
        id: row.photoId,
        url: row.url,
        contentType: row.contentType,
        createdAt: row.photoCreatedAt.toISOString(),
      };
      const entry = entries.get(row.entryId);

      if (entry) {
        entry.photos.push(photo);
        continue;
      }

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
        photos: [photo],
      });
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
