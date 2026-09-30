ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "notify_start_complete_check_in" boolean NOT NULL DEFAULT true;

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "start_complete_notification_time" text NOT NULL DEFAULT '20:30';
