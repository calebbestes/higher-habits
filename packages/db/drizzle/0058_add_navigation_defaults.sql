ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "default_plan_report_view" text DEFAULT 'day-plan' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "default_collab_section" text DEFAULT 'feed' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "default_app_start_page" text DEFAULT 'collab' NOT NULL;
