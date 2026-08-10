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
      .select({
        birthday: users.birthday,
        firstName: users.firstName,
        lastName: users.lastName,
        name: users.name,
        phoneNumber: users.phoneNumber,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      birthday: normalizeDateKey(account.birthday),
      firstName: account.firstName,
      lastName: account.lastName,
      name: account.name,
      phoneNumber: account.phoneNumber,
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
      firstName?: unknown;
      lastName?: unknown;
      phoneNumber?: unknown;
    } | null;
    const patch: {
      birthday?: string;
      firstName?: string;
      lastName?: string;
      name?: string;
      phoneNumber?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (body && "birthday" in body) {
      const birthday = normalizeDateKey(body.birthday);
      if (!birthday) {
        return NextResponse.json(
          { error: "Enter a valid birthday." },
          { status: 400 },
        );
      }
      patch.birthday = birthday;
    }

    if (body && "phoneNumber" in body) {
      if (typeof body.phoneNumber !== "string" || !body.phoneNumber.trim()) {
        return NextResponse.json(
          { error: "Enter a valid phone number." },
          { status: 400 },
        );
      }
      patch.phoneNumber = body.phoneNumber.trim();
    }

    if (body && ("firstName" in body || "lastName" in body)) {
      if (
        typeof body.firstName !== "string" ||
        !body.firstName.trim() ||
        typeof body.lastName !== "string" ||
        !body.lastName.trim()
      ) {
        return NextResponse.json(
          { error: "Enter your first and last name." },
          { status: 400 },
        );
      }

      patch.firstName = body.firstName.trim();
      patch.lastName = body.lastName.trim();
      patch.name = `${patch.firstName} ${patch.lastName}`;
    }

    if (!patch.birthday && !patch.phoneNumber && !patch.name) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 },
      );
    }

    const [account] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, user.id))
      .returning({
        birthday: users.birthday,
        firstName: users.firstName,
        lastName: users.lastName,
        name: users.name,
        phoneNumber: users.phoneNumber,
      });

    if (!account) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      birthday: normalizeDateKey(account.birthday),
      firstName: account.firstName,
      lastName: account.lastName,
      name: account.name,
      phoneNumber: account.phoneNumber,
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
