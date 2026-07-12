import {
  getDb,
  goalCheckpointPhotos,
  goalCheckpoints,
  goalLogPhotos,
  goalLogs,
  goals,
  habits,
  users,
} from "@habit/db";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  GOAL_PHOTOS_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

type Photo = {
  id: string;
  url: string;
  contentType: string;
  createdAt: string;
};

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
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const [me] = await db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!me) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const author = { id: me.id, name: me.name, image: me.image };

    // The user's own completed habit posts (no visibility filtering — it is
    // their own profile).
    const logRows = await db
      .select({
        entryId: goalLogs.id,
        goalId: habits.id,
        goalName: habits.name,
        goalIcon: habits.iconKey,
        dateKey: goalLogs.date,
        notes: goalLogs.notes,
        updatedAt: goalLogs.updatedAt,
      })
      .from(goalLogs)
      .innerJoin(habits, eq(goalLogs.goalId, habits.id))
      .where(
        and(
          eq(goalLogs.userId, user.id),
          eq(goalLogs.status, "complete"),
          eq(habits.userId, goalLogs.userId),
        ),
      )
      .orderBy(desc(goalLogs.updatedAt), desc(goalLogs.date));

    const logIds = logRows.map((row) => row.entryId);
    const logPhotoRows =
      logIds.length > 0
        ? await db
            .select({
              entryId: goalLogPhotos.goalLogId,
              photoId: goalLogPhotos.id,
              storagePath: goalLogPhotos.storagePath,
              contentType: goalLogPhotos.contentType,
              photoCreatedAt: goalLogPhotos.createdAt,
            })
            .from(goalLogPhotos)
            .where(inArray(goalLogPhotos.goalLogId, logIds))
            .orderBy(desc(goalLogPhotos.createdAt))
        : [];

    // Completed goal checkpoints with notes or photos.
    const checkpointRows = await db
      .select({
        entryId: goalCheckpoints.id,
        goalId: goalCheckpoints.goalId,
        goalTitle: goals.title,
        checkpointTitle: goalCheckpoints.title,
        notes: goalCheckpoints.notes,
        completedAt: goalCheckpoints.completedAt,
        updatedAt: goalCheckpoints.updatedAt,
      })
      .from(goalCheckpoints)
      .innerJoin(goals, eq(goalCheckpoints.goalId, goals.id))
      .where(
        and(
          eq(goalCheckpoints.userId, user.id),
          isNotNull(goalCheckpoints.completedAt),
          eq(goals.userId, goalCheckpoints.userId),
        ),
      )
      .orderBy(desc(goalCheckpoints.updatedAt));

    const checkpointIds = checkpointRows.map((row) => row.entryId);
    const checkpointPhotoRows =
      checkpointIds.length > 0
        ? await db
            .select({
              entryId: goalCheckpointPhotos.checkpointId,
              photoId: goalCheckpointPhotos.id,
              storagePath: goalCheckpointPhotos.storagePath,
              contentType: goalCheckpointPhotos.contentType,
              photoCreatedAt: goalCheckpointPhotos.createdAt,
            })
            .from(goalCheckpointPhotos)
            .where(inArray(goalCheckpointPhotos.checkpointId, checkpointIds))
            .orderBy(desc(goalCheckpointPhotos.createdAt))
        : [];

    const signedPhotos = await Promise.all(
      [...logPhotoRows, ...checkpointPhotoRows].map(async (row) => ({
        entryId: row.entryId,
        photo: {
          id: row.photoId,
          url: await createSignedPhotoUrl(row.storagePath),
          contentType: row.contentType,
          createdAt: row.photoCreatedAt.toISOString(),
        } satisfies Photo,
      })),
    );

    const photosByEntryId = new Map<string, Photo[]>();
    for (const { entryId, photo } of signedPhotos) {
      const photos = photosByEntryId.get(entryId) ?? [];
      photos.push(photo);
      photosByEntryId.set(entryId, photos);
    }

    const entries: Array<{
      id: string;
      kind: "habit" | "goal_checkpoint";
      friend: { id: string; name: string; image: string | null };
      goal: { id: string; name: string; icon: string };
      dateKey: string;
      notes: string;
      updatedAt: string;
      canDeletePhotos: boolean;
      props: { count: number; hasPropped: boolean };
      comments: [];
      photos: Photo[];
    }> = [];

    for (const row of logRows) {
      const photos = photosByEntryId.get(row.entryId) ?? [];
      if (!row.notes.trim() && photos.length === 0) continue;

      entries.push({
        id: row.entryId,
        kind: "habit",
        friend: author,
        goal: {
          id: row.goalId,
          name: row.goalName,
          icon: row.goalIcon || "mdi:circle",
        },
        dateKey: row.dateKey,
        notes: row.notes,
        updatedAt: row.updatedAt.toISOString(),
        canDeletePhotos: true,
        props: { count: 0, hasPropped: false },
        comments: [],
        photos,
      });
    }

    for (const row of checkpointRows) {
      if (!row.completedAt) continue;
      const photos = photosByEntryId.get(row.entryId) ?? [];
      if (!row.notes?.trim() && photos.length === 0) continue;

      entries.push({
        id: row.entryId,
        kind: "goal_checkpoint",
        friend: author,
        goal: {
          id: row.goalId,
          name: `${row.goalTitle} · ${row.checkpointTitle}`,
          icon: "checkmark.seal.fill",
        },
        dateKey: row.completedAt.toISOString().slice(0, 10),
        notes: row.notes ?? "",
        updatedAt: row.updatedAt.toISOString(),
        canDeletePhotos: true,
        props: { count: 0, hasPropped: false },
        comments: [],
        photos,
      });
    }

    entries.sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );

    return NextResponse.json(entries);
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
      { error: error instanceof Error ? error.message : "Could not load posts" },
      { status: 500 },
    );
  }
}
