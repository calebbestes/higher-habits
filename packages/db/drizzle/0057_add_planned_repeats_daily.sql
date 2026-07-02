ALTER TABLE "goal_logs" ADD COLUMN IF NOT EXISTS "planned_repeats_daily" boolean DEFAULT false NOT NULL;
