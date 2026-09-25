ALTER TABLE "goal_logs"
ADD COLUMN IF NOT EXISTS "planned_repeat_cadence" text;
--> statement-breakpoint

ALTER TABLE "goal_logs"
ADD COLUMN IF NOT EXISTS "planned_repeat_interval" integer;
--> statement-breakpoint

ALTER TABLE "goal_logs"
ADD COLUMN IF NOT EXISTS "planned_repeat_days" jsonb;
--> statement-breakpoint

ALTER TABLE "goal_logs"
ADD COLUMN IF NOT EXISTS "planned_repeat_monthly_type" text;
