ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "reminder_times" text[];
--> statement-breakpoint
UPDATE "habits"
SET "reminder_times" = ARRAY["reminder_time"]
WHERE "reminder_time" IS NOT NULL
  AND ("reminder_times" IS NULL OR cardinality("reminder_times") = 0);
