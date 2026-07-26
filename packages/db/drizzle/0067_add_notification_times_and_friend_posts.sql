ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notify_friend_posts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "daily_notification_time" text DEFAULT '20:30' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "weekly_notification_time" text DEFAULT '18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "monthly_notification_time" text DEFAULT '09:00' NOT NULL;
