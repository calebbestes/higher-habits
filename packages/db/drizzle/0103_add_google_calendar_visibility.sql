ALTER TABLE "calendar_settings"
ADD COLUMN IF NOT EXISTS "visible_google_calendar_ids" text[]
NOT NULL DEFAULT ARRAY['primary']::text[];

UPDATE "calendar_settings"
SET "visible_google_calendar_ids" = ARRAY['primary']::text[]
WHERE cardinality("visible_google_calendar_ids") = 0;
