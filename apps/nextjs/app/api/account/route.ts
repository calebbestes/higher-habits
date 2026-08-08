import {
  dailyReflectionPhotos,
  getDb,
  goalCheckpointPhotos,
  goalLogPhotos,
  users,
} from "@habit/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  GOAL_PHOTOS_BUCKET,
  PROFILE_PICTURES_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}/;

function normalizeDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const dateKey = value.match(DATE_KEY_REGEX)?.[0];
  if (!dateKey) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return dateKey;
}

async function deleteStorageFilesForUser(userId: string) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const [goalPhotos, checkpointPhotos, reflectionPhotos] = await Promise.all([
    db
      .select({ storagePath: goalLogPhotos.storagePath })
      .from(goalLogPhotos)
      .where(eq(goalLogPhotos.userId, userId)),
    db
      .select({ storagePath: goalCheckpointPhotos.storagePath })
      .from(goalCheckpointPhotos)
      .where(eq(goalCheckpointPhotos.userId, userId)),
    db
      .select({ storagePath: dailyReflectionPhotos.storagePath })
      .from(dailyReflectionPhotos)
      .where(eq(dailyReflectionPhotos.userId, userId)),
  ]);

  const storage = getSupabaseStorageAdmin();
  const goalPhotoPaths = [
    ...goalPhotos.map((photo) => photo.storagePath),
    ...checkpointPhotos.map((photo) => photo.storagePath),
    ...reflectionPhotos.map((photo) => photo.storagePath),
  ];

  if (goalPhotoPaths.length > 0) {
    const { error } = await storage.storage
      .from(GOAL_PHOTOS_BUCKET)
      .remove(goalPhotoPaths);
    if (error)
      throw new Error(`Could not delete goal photos: ${error.message}`);
  }

  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const profileList = await storage.storage
    .from(PROFILE_PICTURES_BUCKET)
    .list(safeUserId, {
      limit: 100,
      search: "profile.",
    });

  if (profileList.error) {
    throw new Error(
      `Could not list profile photos: ${profileList.error.message}`,
    );
  }

  const profilePaths = profileList.data.map(
    (file) => `${safeUserId}/${file.name}`,
  );
  if (profilePaths.length > 0) {
    const { error } = await storage.storage
      .from(PROFILE_PICTURES_BUCKET)
      .remove(profilePaths);
    if (error) {
      throw new Error(`Could not delete profile photos: ${error.message}`);
    }
  }
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

    const [account] = await db
      .select({ birthday: users.birthday })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      birthday: normalizeDateKey(account.birthday),
    });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      birthday?: unknown;
    } | null;
    const birthday = normalizeDateKey(body?.birthday);

    if (!birthday) {
      return NextResponse.json(
        { error: "Enter a valid birthday." },
        { status: 400 },
      );
    }

    const [account] = await db
      .update(users)
      .set({ birthday, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning({ birthday: users.birthday });

    if (!account) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      birthday: normalizeDateKey(account.birthday),
    });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    await deleteStorageFilesForUser(user.id);
    await db.delete(users).where(eq(users.id, user.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
