ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "recurrence_weekdays" integer[];
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "recurrence_month_days" integer[];
--> statement-breakpoint
UPDATE "tasks"
SET "recurrence_weekdays" = ARRAY["recurrence_weekday"]
WHERE "recurrence_weekday" IS NOT NULL
  AND ("recurrence_weekdays" IS NULL OR cardinality("recurrence_weekdays") = 0);
--> statement-breakpoint
UPDATE "tasks"
SET "recurrence_month_days" = ARRAY["recurrence_month_day"]
WHERE "recurrence_month_day" IS NOT NULL
  AND ("recurrence_month_days" IS NULL OR cardinality("recurrence_month_days") = 0);
