ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "plan_on_calendar" boolean DEFAULT true NOT NULL;
