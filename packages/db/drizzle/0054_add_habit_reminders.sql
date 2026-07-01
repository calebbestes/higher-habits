ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "reminder_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "reminder_time" text;
