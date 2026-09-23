ALTER TABLE "calendar_settings"
ADD COLUMN IF NOT EXISTS "float_google_calendar_id" text;

ALTER TABLE "planned_events"
ADD COLUMN IF NOT EXISTS "google_calendar_id" text;

ALTER TABLE "goal_logs"
ADD COLUMN IF NOT EXISTS "google_calendar_id" text;
