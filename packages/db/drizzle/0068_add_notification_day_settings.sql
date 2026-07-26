ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "weekly_notification_day" text DEFAULT 'sunday' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "monthly_notification_day" text DEFAULT 'first' NOT NULL;
