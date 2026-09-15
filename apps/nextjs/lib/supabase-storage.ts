import "server-only";

import { createClient } from "@supabase/supabase-js";

export const GOAL_PHOTOS_BUCKET = "goal-photos";
export const PROFILE_PICTURES_BUCKET = "profile-photos";

type SupabaseStorageClient = ReturnType<typeof createClient>;

type SignedUrlLimiter = {
  active: number;
  queue: Array<() => void>;
};

const globalForSupabaseStorage = globalThis as typeof globalThis & {
  __supabaseStorageAdmin?: SupabaseStorageClient;
  __supabaseSignedUrlLimiter?: SignedUrlLimiter;
};

function getSignedUrlLimiter() {
  globalForSupabaseStorage.__supabaseSignedUrlLimiter ??= {
    active: 0,
    queue: [],
  };

  return globalForSupabaseStorage.__supabaseSignedUrlLimiter;
}

function getSignedUrlConcurrency() {
  const configured = Number.parseInt(
    process.env.SUPABASE_SIGNED_URL_CONCURRENCY ?? "",
    10,
  );

  return Number.isFinite(configured) && configured > 0 ? configured : 2;
}

async function withSignedUrlSlot<T>(callback: () => Promise<T>) {
  const limiter = getSignedUrlLimiter();
  const max = getSignedUrlConcurrency();

  if (limiter.active >= max) {
    await new Promise<void>((resolve) => limiter.queue.push(resolve));
  }

  limiter.active += 1;
  try {
    return await callback();
  } finally {
    limiter.active -= 1;
    limiter.queue.shift()?.();
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStorageError(message: string) {
  const normalized = message.toLocaleLowerCase();
  return (
    normalized.includes("too many connections") ||
    normalized.includes("timeout") ||
    normalized.includes("temporarily unavailable")
  );
}

export function getSupabaseStorageAdmin() {
  if (globalForSupabaseStorage.__supabaseStorageAdmin) {
    return globalForSupabaseStorage.__supabaseStorageAdmin;
  }

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Supabase Storage is not configured.");
  }

  globalForSupabaseStorage.__supabaseStorageAdmin = createClient(
    url,
    secretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return globalForSupabaseStorage.__supabaseStorageAdmin;
}

export async function createSignedStorageUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds = 60 * 60,
) {
  return withSignedUrlSlot(async () => {
    const storage = getSupabaseStorageAdmin();
    let lastMessage = "Unable to create signed URL.";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await storage.storage
        .from(bucket)
        .createSignedUrl(storagePath, expiresInSeconds);

      if (!error) return data.signedUrl;

      lastMessage = error.message;
      if (!isRetryableStorageError(error.message) || attempt === 2) break;
      await delay(150 * (attempt + 1));
    }

    throw new Error(`Could not open photo: ${lastMessage}`);
  });
}

export function createGoalPhotoSignedUrl(storagePath: string) {
  return createSignedStorageUrl(GOAL_PHOTOS_BUCKET, storagePath);
}
