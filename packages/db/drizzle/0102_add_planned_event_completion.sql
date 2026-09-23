ALTER TABLE "planned_events"
ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
