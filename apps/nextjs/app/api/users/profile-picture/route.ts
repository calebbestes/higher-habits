import { getDb, users } from "@habit/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  PROFILE_PICTURES_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

    const formData = await request.formData();
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

    const storage = getSupabaseStorageAdmin();
    const safeUserId = user.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const storagePath = `${safeUserId}/profile.${extension}`;
    const { error: bucketError } = await storage.storage.updateBucket(
      PROFILE_PICTURES_BUCKET,
      {
        public: true,
        fileSizeLimit: MAX_PHOTO_BYTES,
        allowedMimeTypes: Object.keys(CONTENT_TYPE_EXTENSIONS),
      },
    );

    if (bucketError) {
      return NextResponse.json(
        { error: `Could not configure profile photos: ${bucketError.message}` },
        { status: 502 },
      );
    }

    const { error: uploadError } = await storage.storage
      .from(PROFILE_PICTURES_BUCKET)
      .upload(storagePath, await file.arrayBuffer(), {
        cacheControl: "3600",
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Could not upload photo: ${uploadError.message}` },
        { status: 502 },
      );
    }

    const { data: urlData } = storage.storage
      .from(PROFILE_PICTURES_BUCKET)
      .getPublicUrl(storagePath);

    const imageUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    await db
      .update(users)
      .set({ image: imageUrl, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return NextResponse.json({ imageUrl });
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
          error instanceof Error ? error.message : "Could not upload photo",
      },
      { status: 500 },
    );
  }
}
