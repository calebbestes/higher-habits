ALTER TABLE "goal_logs" ADD COLUMN IF NOT EXISTS "planned_start_time" text;
--> statement-breakpoint
ALTER TABLE "goal_logs" ADD COLUMN IF NOT EXISTS "planned_end_time" text;
