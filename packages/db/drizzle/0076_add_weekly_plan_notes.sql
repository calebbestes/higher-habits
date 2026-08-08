CREATE TABLE IF NOT EXISTS "weekly_plan_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"week_start_date" date NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plan_notes_user_week_start_uidx" UNIQUE("user_id","week_start_date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weekly_plan_notes" ADD CONSTRAINT "weekly_plan_notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_plan_notes_user_id_idx" ON "weekly_plan_notes" ("user_id");
