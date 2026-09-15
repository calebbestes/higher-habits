ALTER TABLE "tasks"
ADD COLUMN IF NOT EXISTS "plan_on_calendar" boolean DEFAULT false NOT NULL;
