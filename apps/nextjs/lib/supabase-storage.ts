import "server-only";

import { createClient } from "@supabase/supabase-js";

export const GOAL_PHOTOS_BUCKET = "goal-photos";
export const PROFILE_PICTURES_BUCKET = "profile-photos";

export function getSupabaseStorageAdmin() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Supabase Storage is not configured.");
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
