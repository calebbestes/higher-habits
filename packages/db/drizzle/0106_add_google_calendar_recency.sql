ALTER TABLE "calendar_settings"
ADD COLUMN IF NOT EXISTS "google_calendar_recent_ids" text[]
NOT NULL DEFAULT '{}'::text[];
