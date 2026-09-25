ALTER TABLE "goal_logs"
ADD COLUMN IF NOT EXISTS "planned_repeat_disabled" boolean;
