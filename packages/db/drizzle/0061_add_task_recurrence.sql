ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "recurrence" text DEFAULT 'none' NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "recurrence_weekday" integer;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "recurrence_month_day" integer;
