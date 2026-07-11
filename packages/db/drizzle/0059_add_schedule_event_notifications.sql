ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notify_schedule_events" boolean DEFAULT true NOT NULL;
