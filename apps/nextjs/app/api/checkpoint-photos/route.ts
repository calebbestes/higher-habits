import { getDb, goalCheckpointPhotos, goalCheckpoints } from "@habit/db";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { notifyFriendsOfVisibleCheckpointPost } from "@/lib/friend-post-notifications";
import {
  GOAL_PHOTOS_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const checkpointSchema = z.object({ checkpointId: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });

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

async function findOwnedCheckpoint(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  userId: string,
  checkpointId: string,
) {
  const [checkpoint] = await db
    .select({
      id: goalCheckpoints.id,
      completedAt: goalCheckpoints.completedAt,
      notes: goalCheckpoints.notes,
      visibility: goalCheckpoints.visibility,
    })
    .from(goalCheckpoints)
    .where(
      and(
        eq(goalCheckpoints.id, checkpointId),
        eq(goalCheckpoints.userId, userId),
      ),
    )
    .limit(1);

  return checkpoint ?? null;
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

    const url = new URL(request.url);
    const allCheckpoints = url.searchParams.get("all") === "true";

    // `all=true` returns every checkpoint photo for the journal; otherwise a
    // single checkpoint's photos.
    const rows = await db
      .select()
      .from(goalCheckpointPhotos)
      .where(
        allCheckpoints
          ? eq(goalCheckpointPhotos.userId, user.id)
          : and(
              eq(goalCheckpointPhotos.userId, user.id),
              eq(
                goalCheckpointPhotos.checkpointId,
                checkpointSchema.parse({
                  checkpointId: url.searchParams.get("checkpointId"),
                }).checkpointId,
              ),
            ),
      )
      .orderBy(desc(goalCheckpointPhotos.createdAt));

    return NextResponse.json(
      await Promise.all(
        rows.map(async (photo) => ({
          id: photo.id,
          url: await createSignedPhotoUrl(photo.storagePath),
          contentType: photo.contentType,
          createdAt: photo.createdAt.toISOString(),
          checkpointId: photo.checkpointId,
        })),
      ),
    );
  } catch (error) {
    return handleError(error, "Could not load photos");
  }
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
    const { checkpointId } = checkpointSchema.parse({
      checkpointId: formData.get("checkpointId"),
    });
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Choose a photo first." },
        { status: 400 },
      );
    }

    const extension = CONTENT_TYPE_EXTENSIONS[file.type];
    if (!extension) {
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

    const checkpoint = await findOwnedCheckpoint(db, user.id, checkpointId);
    if (!checkpoint) {
      return NextResponse.json(
        { error: "Checkpoint not found" },
        { status: 404 },
      );
    }

    const [existingPhoto] = await db
      .select({ id: goalCheckpointPhotos.id })
      .from(goalCheckpointPhotos)
      .where(
        and(
          eq(goalCheckpointPhotos.checkpointId, checkpoint.id),
          eq(goalCheckpointPhotos.userId, user.id),
        ),
      )
      .limit(1);
    const shouldNotifyPost =
      Boolean(checkpoint.completedAt) &&
      checkpoint.visibility === "all_friends" &&
      !checkpoint.notes?.trim() &&
      !existingPhoto;

    const safeUserId = user.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const storagePath = `${safeUserId}/checkpoint/${checkpoint.id}/${crypto.randomUUID()}.${extension}`;
    const storage = getSupabaseStorageAdmin();
    const { error: uploadError } = await storage.storage
      .from(GOAL_PHOTOS_BUCKET)
      .upload(storagePath, await file.arrayBuffer(), {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Could not upload photo: ${uploadError.message}` },
        { status: 502 },
      );
    }

    try {
      const signedUrl = await createSignedPhotoUrl(storagePath);
      const [photo] = await db
        .insert(goalCheckpointPhotos)
        .values({
          checkpointId: checkpoint.id,
          userId: user.id,
          storagePath,
          contentType: file.type,
        })
        .returning();

      if (!photo) {
        throw new Error("Could not save photo");
      }

      if (shouldNotifyPost) {
        void notifyFriendsOfVisibleCheckpointPost(db, checkpoint.id);
      }

      const responseBody = {
        id: photo.id,
        url: signedUrl,
        contentType: photo.contentType,
        createdAt: photo.createdAt.toISOString(),
        checkpointId: photo.checkpointId,
      };
      return NextResponse.json(responseBody);
    } catch (error) {
      await storage.storage.from(GOAL_PHOTOS_BUCKET).remove([storagePath]);
      throw error;
    }
  } catch (error) {
    return handleError(error, "Could not upload photo");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const { id } = deleteSchema.parse(await request.json());
    const [photo] = await db
      .select()
      .from(goalCheckpointPhotos)
      .where(
        and(
          eq(goalCheckpointPhotos.id, id),
          eq(goalCheckpointPhotos.userId, user.id),
        ),
      )
      .limit(1);

    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const storage = getSupabaseStorageAdmin();
    const { error: removeError } = await storage.storage
      .from(GOAL_PHOTOS_BUCKET)
      .remove([photo.storagePath]);

    if (removeError) {
      return NextResponse.json(
        { error: `Could not delete photo: ${removeError.message}` },
        { status: 502 },
      );
    }

    await db
      .delete(goalCheckpointPhotos)
      .where(
        and(
          eq(goalCheckpointPhotos.id, id),
          eq(goalCheckpointPhotos.userId, user.id),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error, "Internal server error");
  }
}

function handleError(error: unknown, fallback: string) {
  const authErrorResponse = toAuthErrorResponse(error);

  if (authErrorResponse) {
    return authErrorResponse;
  }

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
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}
