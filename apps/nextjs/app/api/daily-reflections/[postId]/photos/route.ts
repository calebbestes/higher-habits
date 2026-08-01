import { dailyReflectionPhotos, dailyReflectionPosts, getDb } from "@habit/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { postId: postIdParam } = await params;
    const postId = z.string().uuid().parse(postIdParam);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const [post] = await db
      .select({ id: dailyReflectionPosts.id })
      .from(dailyReflectionPosts)
      .where(
        and(
          eq(dailyReflectionPosts.id, postId),
          eq(dailyReflectionPosts.userId, user.id),
        ),
      )
      .limit(1);

    if (!post) {
      return NextResponse.json(
        { error: "Reflection post not found." },
        { status: 404 },
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

    const safeUserId = user.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const storagePath = `${safeUserId}/daily-reflections/${postId}/${crypto.randomUUID()}.${extension}`;
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
        .insert(dailyReflectionPhotos)
        .values({
          reflectionPostId: postId,
          userId: user.id,
          storagePath,
          contentType: file.type,
        })
        .returning();

      if (!photo) {
        throw new Error("Could not save photo");
      }

      return NextResponse.json({
        id: photo.id,
        url: signedUrl,
        contentType: photo.contentType,
        createdAt: photo.createdAt.toISOString(),
      });
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
      { error: "Could not upload photo" },
      { status: 500 },
    );
  }
}
