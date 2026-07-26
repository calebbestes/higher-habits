import { getDb, goalLogPhotos, goalLogs, habits } from "@habit/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { notifyFriendsOfVisibleHabitPost } from "@/lib/friend-post-notifications";
import {
  GOAL_PHOTOS_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const goalDateSchema = z.object({
  goalId: z.string().uuid(),
  dateKey: z.string().regex(DATE_KEY_REGEX),
});

const goalRangeSchema = z
  .object({
    goalId: z.string().uuid().optional(),
    startDateKey: z.string().regex(DATE_KEY_REGEX),
    endDateKey: z.string().regex(DATE_KEY_REGEX),
  })
  .refine(({ startDateKey, endDateKey }) => startDateKey <= endDateKey, {
    message: "Start date must be before end date",
  });

const allGoalPhotosSchema = z.object({
  goalId: z.string().uuid().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

const getDatabase = () => getDb() ?? null;

async function findOwnedGoalLog(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  userId: string,
  goalId: string,
  dateKey: string,
) {
  const [goalLog] = await db
    .select({ id: goalLogs.id })
    .from(goalLogs)
    .where(
      and(
        eq(goalLogs.userId, userId),
        eq(goalLogs.goalId, goalId),
        eq(goalLogs.date, dateKey),
      ),
    )
    .limit(1);

  return goalLog ?? null;
}

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

    const url = new URL(request.url);
    const queryGoalId = url.searchParams.get("goalId");
    const startDateKey = url.searchParams.get("startDateKey");
    const endDateKey = url.searchParams.get("endDateKey");
    const allDates = url.searchParams.get("all") === "true";

    if (allDates || startDateKey || endDateKey) {
      const range: {
        goalId?: string;
        startDateKey?: string;
        endDateKey?: string;
      } = allDates
        ? allGoalPhotosSchema.parse({ goalId: queryGoalId ?? undefined })
        : goalRangeSchema.parse({
            goalId: queryGoalId ?? undefined,
            startDateKey,
            endDateKey,
          });
      const photos = await db
        .select({
          id: goalLogPhotos.id,
          storagePath: goalLogPhotos.storagePath,
          contentType: goalLogPhotos.contentType,
          createdAt: goalLogPhotos.createdAt,
          dateKey: goalLogs.date,
          goalId: goalLogs.goalId,
        })
        .from(goalLogPhotos)
        .innerJoin(goalLogs, eq(goalLogPhotos.goalLogId, goalLogs.id))
        .where(
          and(
            eq(goalLogPhotos.userId, user.id),
            eq(goalLogs.userId, user.id),
            range.goalId ? eq(goalLogs.goalId, range.goalId) : undefined,
            range.startDateKey
              ? gte(goalLogs.date, range.startDateKey)
              : undefined,
            range.endDateKey ? lte(goalLogs.date, range.endDateKey) : undefined,
          ),
        )
        .orderBy(desc(goalLogs.date), desc(goalLogPhotos.createdAt));

      return NextResponse.json(
        await Promise.all(
          photos.map(async (photo) => ({
            id: photo.id,
            url: await createSignedPhotoUrl(photo.storagePath),
            contentType: photo.contentType,
            createdAt: photo.createdAt.toISOString(),
            dateKey: photo.dateKey,
            goalId: photo.goalId,
          })),
        ),
      );
    }

    const { goalId, dateKey } = goalDateSchema.parse({
      goalId: queryGoalId,
      dateKey: url.searchParams.get("dateKey"),
    });
    const goalLog = await findOwnedGoalLog(db, user.id, goalId, dateKey);

    if (!goalLog) {
      return NextResponse.json([]);
    }

    const photos = await db
      .select()
      .from(goalLogPhotos)
      .where(
        and(
          eq(goalLogPhotos.goalLogId, goalLog.id),
          eq(goalLogPhotos.userId, user.id),
        ),
      )
      .orderBy(desc(goalLogPhotos.createdAt));

    return NextResponse.json(
      await Promise.all(
        photos.map(async (photo) => ({
          id: photo.id,
          url: await createSignedPhotoUrl(photo.storagePath),
          contentType: photo.contentType,
          createdAt: photo.createdAt.toISOString(),
        })),
      ),
    );
  } catch (error) {
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
      {
        error: error instanceof Error ? error.message : "Could not load photos",
      },
      { status: 500 },
    );
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
    const { goalId, dateKey } = goalDateSchema.parse({
      goalId: formData.get("goalId"),
      dateKey: formData.get("dateKey"),
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

    const [goal] = await db
      .select({ id: habits.id, visibility: habits.visibility })
      .from(habits)
      .where(and(eq(habits.id, goalId), eq(habits.userId, user.id)))
      .limit(1);

    if (!goal) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    const [goalLog] = await db
      .insert(goalLogs)
      .values({
        userId: user.id,
        goalId,
        date: dateKey,
        status: "planned",
        visibility: goal.visibility,
      })
      .onConflictDoUpdate({
        target: [goalLogs.goalId, goalLogs.date],
        set: {
          userId: user.id,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: goalLogs.id,
        notes: goalLogs.notes,
        status: goalLogs.status,
      });

    if (!goalLog) {
      return NextResponse.json(
        { error: "Could not create goal log" },
        { status: 500 },
      );
    }

    const [existingPhoto] = await db
      .select({ id: goalLogPhotos.id })
      .from(goalLogPhotos)
      .where(
        and(
          eq(goalLogPhotos.goalLogId, goalLog.id),
          eq(goalLogPhotos.userId, user.id),
        ),
      )
      .limit(1);
    const shouldNotifyPost =
      goalLog.status === "complete" && !goalLog.notes.trim() && !existingPhoto;

    const safeUserId = user.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const storagePath = `${safeUserId}/${goalLog.id}/${crypto.randomUUID()}.${extension}`;
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
        .insert(goalLogPhotos)
        .values({
          goalLogId: goalLog.id,
          userId: user.id,
          storagePath,
          contentType: file.type,
        })
        .returning();

      if (!photo) {
        throw new Error("Could not save photo");
      }

      if (shouldNotifyPost) {
        void notifyFriendsOfVisibleHabitPost(db, goalLog.id);
      }

      const responseBody = {
        id: photo.id,
        url: signedUrl,
        contentType: photo.contentType,
        createdAt: photo.createdAt.toISOString(),
      };
      return NextResponse.json(responseBody);
    } catch (error) {
      await storage.storage.from(GOAL_PHOTOS_BUCKET).remove([storagePath]);
      throw error;
    }
  } catch (error) {
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
      {
        error:
          error instanceof Error ? error.message : "Could not upload photo",
      },
      { status: 500 },
    );
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
      .from(goalLogPhotos)
      .where(and(eq(goalLogPhotos.id, id), eq(goalLogPhotos.userId, user.id)))
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
      .delete(goalLogPhotos)
      .where(and(eq(goalLogPhotos.id, id), eq(goalLogPhotos.userId, user.id)));

    return NextResponse.json({ ok: true });
  } catch (error) {
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
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
