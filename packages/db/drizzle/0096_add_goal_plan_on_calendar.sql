ALTER TABLE "goals"
ADD COLUMN IF NOT EXISTS "plan_on_calendar" boolean DEFAULT false NOT NULL;
