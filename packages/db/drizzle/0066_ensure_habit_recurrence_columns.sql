ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "repeat_interval" integer;
--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "repeat_days" json;
--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "repeat_monthly_type" text;
